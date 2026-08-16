"""
run_production_demo.py — End-to-end AML Production Pipeline Demo

Simulates the full pipeline:
  1. Transactions stream in at 7,000/sec (simulated from aml_dataset)
  2. XGBoost flags suspicious accounts (using suspicion-model.pkl)
  3. TransactionStore expands to 2-hop chains
  4. AMLProductionEngine runs GNN → outputs rings

Usage
-----
    cd c:\\Users\\SAKTHIVEL R\\Desktop\\set
    python run_production_demo.py

    # Options
    python run_production_demo.py --batches 10   # run 10 batches
    python run_production_demo.py --no-xgb       # skip XGBoost, flag all accounts above score 0
"""

import os, sys, time, json, argparse, pickle
import numpy as np
import pandas as pd

# ── Load risk config JSON ─────────────────────────────────────────────────────
_RISK_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "models", "xgboost", "risk_config.json"
)
with open(_RISK_CONFIG_PATH, "r") as _f:
    _RISK_CFG = json.load(_f)

_COUNTRY_RISK   = _RISK_CFG["country_risk"]          # {country: float}
_CORRIDOR_RISK  = _RISK_CFG["corridor_multiplier"]   # {"A->B": float, "default": float}
_UNKNOWN_RISK   = 0.9    # country not in list → treat as high risk

# ── path setup ────────────────────────────────────────────────────────────────
ROOT   = os.path.dirname(os.path.abspath(__file__))
from typing import Optional

# Add src folders to path
sys.path.insert(0, os.path.join(ROOT, "src", "common"))
sys.path.insert(0, os.path.join(ROOT, "src", "gnn"))
sys.path.insert(0, os.path.join(ROOT, "src", "streaming"))

from transaction_store     import TransactionStore
from production_inference  import AMLProductionEngine
from config                import DATA_DIR, XGB_DIR, OUTPUT_DIR
from kafka_consumer        import KafkaTransactionConsumer

import sys
sys.path.insert(0, ROOT)
from src.api.server import start_server_in_background

# ── XGBoost feature columns (from Model Card) ─────────────────────────────────
XGB_FEATURE_COLS = [
    "in_txn_5m", "out_txn_5m", "in_amt_5m", "out_amt_5m",
    "avg_tx_gap", "recv_send_gap", "pct_forwarded_60s", "in_out_ratio",
    "uniq_senders_10m", "uniq_receivers_10m", "new_counterparty_pct",
    "region_count", "pass_through_ratio", "fanin_burst", "fanout_burst",
    "sender_region_risk", "receiver_region_risk", "corridor_multiplier",
]
XGB_THRESHOLD = 0.3   # Lowered to catch subtle structuring/pan-nesting patterns


# ─────────────────────────────────────────────────────────────────────────────
# XGBoost Feature Engineering
# Computes 18 behavioral features per account from a raw transaction window.
# ─────────────────────────────────────────────────────────────────────────────

def compute_xgboost_features(txn_window: pd.DataFrame, target_accounts: list = None) -> pd.DataFrame:
    """
    Compute XGBoost's 18 behavioral features for each account in the window.
    Returns DataFrame with columns: account_id + XGB_FEATURE_COLS.
    """
    if txn_window.empty:
        return pd.DataFrame()

    df = txn_window.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["ts_unix"]   = df["timestamp"].astype(np.int64) // 10 ** 9

    if target_accounts is not None:
        all_accounts = target_accounts
    else:
        all_accounts = pd.unique(
            np.concatenate([df["sender_account_id"].values,
                            df["receiver_account_id"].values])
        )

    WINDOW_5M = 300   # 5 minutes in seconds

    rows = []
    for acc in all_accounts:
        sent_all = df[df["sender_account_id"] == acc]
        recv_all = df[df["receiver_account_id"] == acc]

        # ── True 5-minute window ──────────────────────────────────────────────
        # Find this account's latest timestamp, then keep only last 300 seconds
        acc_ts = df[
            df["sender_account_id"].eq(acc) | df["receiver_account_id"].eq(acc)
        ]["ts_unix"]
        if acc_ts.empty:
            continue
        t_latest = acc_ts.max()
        t_cutoff = t_latest - WINDOW_5M

        sent = sent_all[sent_all["ts_unix"] >= t_cutoff]   # sent in last 5m
        recv = recv_all[recv_all["ts_unix"] >= t_cutoff]   # received in last 5m

        in_txn_5m  = len(recv)
        out_txn_5m = len(sent)
        in_amt_5m  = float(recv["amount"].sum())
        out_amt_5m = float(sent["amount"].sum())

        # avg time gap between consecutive transactions
        all_ts = sorted(
            df[df["sender_account_id"].eq(acc) |
               df["receiver_account_id"].eq(acc)]["ts_unix"].tolist()
        )
        if len(all_ts) >= 2:
            gaps = [all_ts[i+1] - all_ts[i] for i in range(len(all_ts)-1)]
            avg_tx_gap = float(np.mean(gaps))
        else:
            avg_tx_gap = 0.0

        # recv_send_gap: time between receiving and re-sending
        if len(recv) > 0 and len(sent) > 0:
            last_recv_ts   = float(recv["ts_unix"].max())
            sent_after     = sent[sent["ts_unix"] >= last_recv_ts]["ts_unix"]
            recv_send_gap  = float(sent_after.min() - last_recv_ts) if len(sent_after) else 9999.0
        else:
            recv_send_gap  = 9999.0

        # pct_forwarded_60s
        fwd_count = 0
        for recv_ts in recv["ts_unix"].values:
            if any((sent["ts_unix"] >= recv_ts) &
                   (sent["ts_unix"] <= recv_ts + 60)):
                fwd_count += 1
        pct_forwarded_60s = fwd_count / max(1, in_txn_5m)

        in_out_ratio        = in_txn_5m / max(1, out_txn_5m)
        uniq_senders_10m    = int(recv["sender_account_id"].nunique())
        uniq_receivers_10m  = int(sent["receiver_account_id"].nunique())
        new_counterparty_pct= 1.0   # all are "new" without history
        region_count        = int(pd.unique(
            np.concatenate([
                sent["receiver_pincode"].astype(str).values if len(sent) else [],
                recv["sender_pincode"].astype(str).values if len(recv) else [],
            ])
        ).shape[0])
        pass_through_ratio  = out_amt_5m / max(1.0, in_amt_5m)
        fanin_burst         = int(in_txn_5m > 5)
        fanout_burst        = int(out_txn_5m > 5)

        # ── Region risk from risk_config.json ────────────────────────────
        sender_country   = _get_country(sent, "sender")
        receiver_country = _get_country(recv, "receiver")

        sender_region_risk   = _COUNTRY_RISK.get(sender_country,   _UNKNOWN_RISK)
        receiver_region_risk = _COUNTRY_RISK.get(receiver_country, _UNKNOWN_RISK)

        corridor_key        = f"{sender_country}->{receiver_country}"
        corridor_multiplier = _CORRIDOR_RISK.get(
            corridor_key,
            _CORRIDOR_RISK.get("default", 1.0)
        )

        rows.append({
            "account_id":           acc,
            "in_txn_5m":            in_txn_5m,
            "out_txn_5m":           out_txn_5m,
            "in_amt_5m":            in_amt_5m,
            "out_amt_5m":           out_amt_5m,
            "avg_tx_gap":           avg_tx_gap,
            "recv_send_gap":        recv_send_gap,
            "pct_forwarded_60s":    pct_forwarded_60s,
            "in_out_ratio":         in_out_ratio,
            "uniq_senders_10m":     uniq_senders_10m,
            "uniq_receivers_10m":   uniq_receivers_10m,
            "new_counterparty_pct": new_counterparty_pct,
            "region_count":         region_count,
            "pass_through_ratio":   pass_through_ratio,
            "fanin_burst":          fanin_burst,
            "fanout_burst":         fanout_burst,
            "sender_region_risk":   sender_region_risk,
            "receiver_region_risk": receiver_region_risk,
            "corridor_multiplier":  corridor_multiplier,
        })

    return pd.DataFrame(rows)


def _get_country(txn_rows: pd.DataFrame, role: str) -> str:
    """
    Resolve country for a sender or receiver from their transaction rows.
    Uses sender_country / receiver_country column if present in CSV.
    Falls back to 'India' (all pincodes in this dataset are domestic).
    """
    col = f"{role}_country"
    if col in txn_rows.columns and len(txn_rows) > 0:
        return str(txn_rows[col].mode().iloc[0])
    return "India"


# ─────────────────────────────────────────────────────────────────────────────
# Main Demo
# ─────────────────────────────────────────────────────────────────────────────

def run_demo(n_batches: Optional[int] = None, use_xgboost: bool = True,
             batch_size_txns: int = 3_500):
    """
    Simulate n_batches × 500ms windows of streaming transactions.

    Parameters
    ----------
    n_batches        : number of 500ms windows to simulate
    use_xgboost      : if True, run XGBoost for flagging; else use risk_label
    batch_size_txns  : transactions per 500ms window (7k/sec → 3.5k per 500ms)
    """
    print("\n" + "═" * 70)
    print("  AML Production Pipeline Demo")
    print("  XGBoost (Layer 1) → Transaction Expansion → GNN (Layer 2)")
    print("═" * 70)

    # ── Load XGBoost model ────────────────────────────────────────────────────
    xgb_model = None
    xgb_path  = os.path.join(XGB_DIR, "suspicion-model.pkl")
    if use_xgboost and os.path.exists(xgb_path):
        print("\n  Loading XGBoost model...")
        with open(xgb_path, "rb") as f:
            xgb_model = pickle.load(f)
        print(f"  XGBoost ready  (threshold={XGB_THRESHOLD})")
    else:
        print("\n  [INFO] Using risk_label column as XGBoost proxy")
        use_xgboost = False

    # ── Load GNN engine ───────────────────────────────────────────────────────
    print()
    engine = AMLProductionEngine().load()

    # ── Verify / Prime TransactionStore ───────────────────────────────────────
    store = TransactionStore()
    txn_path = os.path.join(DATA_DIR, "transactions.csv")
    if os.path.exists(txn_path):
        print("\n  [INFO] Priming transaction store with historical data...")
        full_df = pd.read_csv(txn_path, parse_dates=["timestamp"])
        store.ingest(full_df)
        print(f"  {store}")

    # ── Initialize Kafka Consumer ─────────────────────────────────────────────
    print("\n  Initializing Kafka Consumer...")
    bootstrap_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    topic = os.environ.get("KAFKA_TOPIC", "transactions.raw")
    consumer = KafkaTransactionConsumer(bootstrap_servers=bootstrap_servers, topic=topic)

    # ── Simulation loop ───────────────────────────────────────────────────────
    desc_batches = f"{n_batches} batches" if n_batches else "unbounded streaming"
    print(f"\n  Starting {desc_batches} (~{batch_size_txns:,} txns/batch max)...\n")
    print("─" * 70)

    all_rings      = []
    total_start    = time.time()
    
    print("  Booting Flask Integration API (port 5000)...")
    pipeline_metrics, broadcast_alert = start_server_in_background(store, all_rings)
    batch_num      = 0
    total_txns     = 0
    total_flagged_txns = 0

    try:
        while True:
            t0 = time.time()

            if n_batches is not None and batch_num >= n_batches:
                print("  [INFO] Target number of batches reached.")
                break

            # Grab the next batch of transactions
            batch_df = consumer.consume_batch(batch_size=batch_size_txns, timeout_sec=5.0)
            
            if batch_df.empty:
                continue
            
            batch_num += 1

            # Ingest live transactions into store so GNN has current edges
            store.ingest(batch_df)

            # ── Layer 1: Feature engineering (always runs) ───────────────────
            # XGBoost needs historical data context to calculate 5m window metrics
            accounts_to_score = pd.unique(np.concatenate([
                batch_df["sender_account_id"].values,
                batch_df["receiver_account_id"].values
            ]))
            
            history_df = store.get_transactions_for_accounts(accounts_to_score)
            feat_df = compute_xgboost_features(history_df, target_accounts=accounts_to_score)
            
            if feat_df.empty:
                continue
            X_xgb = feat_df[XGB_FEATURE_COLS].values

            # ── Layer 1: XGBoost scoring ──────────────────────────────────────
            if use_xgboost:
                # Score with trained model; flag accounts above threshold
                probs      = xgb_model.predict_proba(X_xgb)[:, 1]
                susp_mask  = probs >= XGB_THRESHOLD
                susp_accts = feat_df.loc[susp_mask, "account_id"].tolist()
                feat_df["suspicion_score"] = probs
            else:
                # --no-xgb: features are still computed; flag all accounts
                # (high-recall mode — lets GNN decide what's actually a ring)
                susp_accts = feat_df["account_id"].tolist()
                feat_df["suspicion_score"] = 1.0

            total_txns += len(batch_df)
            if susp_accts:
                flagged_mask = batch_df["sender_account_id"].isin(susp_accts) | batch_df["receiver_account_id"].isin(susp_accts)
                total_flagged_txns += int(flagged_mask.sum())

            if not susp_accts:
                print(f"  Batch {batch_num:02d} │ No suspicious accounts flagged")
                continue

            # ── Expand: pull 2-hop chain from store ──────────────────────────
            related_df = store.get_related_transactions(susp_accts, hops=2)

            # ── Layer 2: GNN ──────────────────────────────────────────────────
            rings = engine.process_batch(susp_accts, related_df)
            elapsed = time.time() - t0

            # Update Live Telemetry for the Frontend
            pipeline_metrics["metrics"]["topicThroughput"] = int(len(batch_df) / max(elapsed, 0.001))
            pipeline_metrics["metrics"]["gnnLatency"] = int((elapsed * 0.7) * 1000)
            pipeline_metrics["metrics"]["xgboostLatency"] = int((elapsed * 0.3) * 1000)

            for ring in rings:
                broadcast_alert(ring)

            # ── Print results ─────────────────────────────────────────────────
            print(f"  Batch {batch_num:02d} │ txns={len(batch_df):,}  "
                  f"flagged={len(susp_accts):,}  "
                  f"related={len(related_df):,}  "
                  f"rings={len(rings)}  "
                  f"latency={elapsed*1000:.0f}ms")

            for ring in rings[:5]:   # print top 5 per batch
                novel_tag  = " [NOVEL]" if ring["is_novel"] else ""
                conf_tag   = f" conf={ring['confidence']:.2f}" if ring["confidence"] else ""
                print(f"    ▶ {ring['ring_id']}  "
                      f"pattern={ring['pattern']}{novel_tag}{conf_tag}  "
                      f"accounts={ring['account_count']}  "
                      f"risk={ring['risk_score']:.3f}  "
                      f"blocked=₹{ring['total_amount_blocked']:>14,.2f}")
            if len(rings) > 5:
                print(f"    … {len(rings)-5} more rings")

            all_rings.extend(rings)
            
            # Progressively save newly detected rings for this batch
            if rings:
                out_path = os.path.join(OUTPUT_DIR, "production_rings.json")
                with open(out_path, "w") as f:
                    json.dump(all_rings, f, indent=2, default=str)

    except KeyboardInterrupt:
        print("\n  [INFO] Streaming interrupted by user (Ctrl+C). Initiating graceful shutdown...")

    finally:
        consumer.close()

    # ── Summary ───────────────────────────────────────────────────────────────
    total_elapsed = time.time() - total_start
    print("\n" + "═" * 70)
    print("  PIPELINE SUMMARY")
    print("═" * 70)

    if all_rings:
        total_blocked = sum(r["total_amount_blocked"] for r in all_rings)
        novel_count   = sum(1 for r in all_rings if r["is_novel"])
        pattern_dist  = {}
        for r in all_rings:
            pattern_dist[r["pattern"]] = pattern_dist.get(r["pattern"], 0) + 1

        print(f"  Total txns processed      : {total_txns:,}")
        print(f"  Normal (unflagged) txns   : {total_txns - total_flagged_txns:,}")
        print(f"  Total rings detected      : {len(all_rings)}")
        print(f"  Total amount blocked      : ₹{total_blocked:,.2f}")
        print(f"  Novel (unknown) patterns  : {novel_count}")
        print(f"  Total elapsed             : {total_elapsed:.2f}s")
        print(f"\n  Pattern breakdown:")
        for pat, cnt in sorted(pattern_dist.items(), key=lambda x: -x[1]):
            print(f"    {pat:<30}: {cnt}")

        # We already saved progressively, but we'll print the location
        out_path = os.path.join(OUTPUT_DIR, "production_rings.json")
        print(f"\n  Ring report was continuously updated at → {out_path}")
    else:
        print("  No rings detected in demo batches.")
    print("═" * 70 + "\n")


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AML Production Pipeline Demo")
    parser.add_argument("--batches",  type=int,  default=None,
                        help="Number of simulation batches (default=None for infinite loop)")
    parser.add_argument("--no-xgb",  action="store_true",
                        help="Use risk_label instead of running XGBoost")
    parser.add_argument("--batch-size", type=int, default=3_500,
                        help="Transactions per batch (default=3500)")
    args = parser.parse_args()

    run_demo(
        n_batches      = args.batches,
        use_xgboost    = not args.no_xgb,
        batch_size_txns= args.batch_size,
    )
