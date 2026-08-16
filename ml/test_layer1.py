"""
test_layer1.py — Layer 1 Test: Transactions → Features → XGBoost Scores

Flow:
    transactions.csv
        │
        ▼
    compute_features()          ← all 18 features
        │  ├─ 15 features from raw txn data (count/sum/ratio/timing)
        │  └─ 3 features from risk_config.json:
        │         sender_region_risk   ← country_risk[sender_country]
        │         receiver_region_risk ← country_risk[receiver_country]
        │         corridor_multiplier  ← corridor_multiplier[A->B]
        ▼
    XGBoost (suspicion-model.pkl)
        │
        ▼
    Suspicion scores per account  (0.0 → 1.0)

Usage:
    python test_layer1.py
    python test_layer1.py --rows 500    # use first 500 rows
    python test_layer1.py --top 20      # show top-N suspicious accounts
"""

import os, json, pickle, argparse
import numpy as np
import pandas as pd

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT      = os.path.dirname(os.path.abspath(__file__))
CSV_PATH  = os.path.join(ROOT, "data", "aml_dataset", "transactions.csv")
XGB_MODEL = os.path.join(ROOT, "models", "xgboost", "suspicion-model.pkl")
CFG_PATH  = os.path.join(ROOT, "models", "xgboost", "risk_config.json")

# ── Load risk_config.json ──────────────────────────────────────────────────────
with open(CFG_PATH) as f:
    _RISK_CFG = json.load(f)

COUNTRY_RISK  = _RISK_CFG["country_risk"]        # {"India": 0.15, "Iran": 1.0, ...}
CORRIDOR_RISK = _RISK_CFG["corridor_multiplier"] # {"Iran->UAE": 1.5, "default": 1.0, ...}
UNKNOWN_RISK  = 0.9   # any country NOT in the JSON → high risk

XGB_THRESHOLD    = 0.3
XGB_FEATURE_COLS = [
    "in_txn_5m", "out_txn_5m", "in_amt_5m", "out_amt_5m",
    "avg_tx_gap", "recv_send_gap", "pct_forwarded_60s", "in_out_ratio",
    "uniq_senders_10m", "uniq_receivers_10m", "new_counterparty_pct",
    "region_count", "pass_through_ratio", "fanin_burst", "fanout_burst",
    "sender_region_risk", "receiver_region_risk", "corridor_multiplier",
]


# ── Feature Engineering ────────────────────────────────────────────────────────

def _resolve_country(rows: pd.DataFrame, role: str) -> str:
    """
    Get the country for a sender or receiver from the transaction rows.
    Uses 'sender_country' / 'receiver_country' column if it exists.
    Falls back to 'India' (all pincodes in this dataset are Indian).
    """
    col = f"{role}_country"
    if col in rows.columns and len(rows) > 0:
        return str(rows[col].mode().iloc[0])
    return "India"


def compute_features(txn_window: pd.DataFrame) -> pd.DataFrame:
    """
    Compute 18 XGBoost features per account from a transaction batch.

    Feature sources:
      ┌──────────────────────────────────────────────────────────────┐
      │  15 features  ← raw txn data (count / sum / timing / ratio) │
      │   3 features  ← risk_config.json (country + corridor risk)  │
      └──────────────────────────────────────────────────────────────┘
    """
    if txn_window.empty:
        return pd.DataFrame()

    df = txn_window.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["ts_unix"]   = df["timestamp"].astype(np.int64) // 10 ** 9

    all_accounts = pd.unique(
        np.concatenate([df["sender_account_id"].values,
                        df["receiver_account_id"].values])
    )

    WINDOW_5M = 300   # 5 minutes in seconds

    rows = []
    for acc in all_accounts:
        sent_all = df[df["sender_account_id"]   == acc]
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

        # ── 1-4: Volume features (from raw txn data) ──────────────────────
        in_txn_5m  = len(recv)
        out_txn_5m = len(sent)
        in_amt_5m  = float(recv["amount"].sum())
        out_amt_5m = float(sent["amount"].sum())

        # ── 5: Average time gap between consecutive transactions ───────────
        all_ts = sorted(
            df[df["sender_account_id"].eq(acc) |
               df["receiver_account_id"].eq(acc)]["ts_unix"].tolist()
        )
        avg_tx_gap = float(np.mean(
            [all_ts[i+1] - all_ts[i] for i in range(len(all_ts)-1)]
        )) if len(all_ts) >= 2 else 0.0

        # ── 6: How fast money is re-sent after being received ─────────────
        if len(recv) > 0 and len(sent) > 0:
            last_recv_ts  = float(recv["ts_unix"].max())
            sent_after    = sent[sent["ts_unix"] >= last_recv_ts]["ts_unix"]
            recv_send_gap = float(sent_after.min() - last_recv_ts) if len(sent_after) else 9999.0
        else:
            recv_send_gap = 9999.0

        # ── 7: % of received funds forwarded within 60s ───────────────────
        fwd_count = sum(
            1 for rt in recv["ts_unix"].values
            if any((sent["ts_unix"] >= rt) & (sent["ts_unix"] <= rt + 60))
        )
        pct_forwarded_60s = fwd_count / max(1, in_txn_5m)

        # ── 8-12: Ratio / diversity features ──────────────────────────────
        in_out_ratio       = in_txn_5m / max(1, out_txn_5m)
        uniq_senders_10m   = int(recv["sender_account_id"].nunique())
        uniq_receivers_10m = int(sent["receiver_account_id"].nunique())
        new_counterparty_pct = 1.0   # all are "new" in a fresh window

        # ── 13: Geographic spread (unique pincodes seen) ──────────────────
        region_count = int(pd.unique(np.concatenate([
            sent["receiver_pincode"].astype(str).values if len(sent) else [],
            recv["sender_pincode"].astype(str).values   if len(recv) else [],
        ])).shape[0])

        # ── 14-15: Pass-through & burst flags ─────────────────────────────
        pass_through_ratio = out_amt_5m / max(1.0, in_amt_5m)
        fanin_burst        = int(in_txn_5m  > 5)
        fanout_burst       = int(out_txn_5m > 5)

        # ── 16-18: Country risk  ←── FROM risk_config.json ────────────────
        sender_country   = _resolve_country(sent, "sender")
        receiver_country = _resolve_country(recv, "receiver")

        sender_region_risk   = COUNTRY_RISK.get(sender_country,   UNKNOWN_RISK)
        receiver_region_risk = COUNTRY_RISK.get(receiver_country, UNKNOWN_RISK)

        corridor_key        = f"{sender_country}->{receiver_country}"
        corridor_multiplier = CORRIDOR_RISK.get(
            corridor_key,
            CORRIDOR_RISK.get("default", 1.0)
        )

        rows.append({
            "account_id"          : acc,
            # ── txn-derived (15) ──────────────────────────────────────────
            "in_txn_5m"           : in_txn_5m,
            "out_txn_5m"          : out_txn_5m,
            "in_amt_5m"           : in_amt_5m,
            "out_amt_5m"          : out_amt_5m,
            "avg_tx_gap"          : avg_tx_gap,
            "recv_send_gap"       : recv_send_gap,
            "pct_forwarded_60s"   : pct_forwarded_60s,
            "in_out_ratio"        : in_out_ratio,
            "uniq_senders_10m"    : uniq_senders_10m,
            "uniq_receivers_10m"  : uniq_receivers_10m,
            "new_counterparty_pct": new_counterparty_pct,
            "region_count"        : region_count,
            "pass_through_ratio"  : pass_through_ratio,
            "fanin_burst"         : fanin_burst,
            "fanout_burst"        : fanout_burst,
            # ── risk_config.json (3) ──────────────────────────────────────
            "sender_region_risk"  : sender_region_risk,
            "receiver_region_risk": receiver_region_risk,
            "corridor_multiplier" : corridor_multiplier,
            # ── debug info (not fed to XGBoost) ──────────────────────────
            "_sender_country"     : sender_country,
            "_receiver_country"   : receiver_country,
            "_corridor_key"       : corridor_key,
        })

    return pd.DataFrame(rows)


# ── Main ───────────────────────────────────────────────────────────────────────

def run(n_rows: int = 3500, top_n: int = 15):
    print("\n" + "═" * 65)
    print("  Layer 1 Test: Transactions → Features → XGBoost")
    print("═" * 65)

    # 1. Load data ─────────────────────────────────────────────────────────────
    print(f"\n[1] Loading {n_rows:,} transactions from CSV …")
    df = pd.read_csv(CSV_PATH, nrows=n_rows, parse_dates=["timestamp"])
    print(f"    Columns : {df.columns.tolist()}")
    print(f"    Rows    : {len(df):,}")

    has_country = "sender_country" in df.columns
    print(f"    Country columns present: {has_country}")
    if not has_country:
        print("    ⚠  Run patch_country_columns.py first to add country data.")
        print("    ⚠  Defaulting all to 'India' for now.")

    # 2. Compute features ──────────────────────────────────────────────────────
    print(f"\n[2] Computing 18 features per account …")
    feat_df = compute_features(df)
    print(f"    Accounts in batch : {len(feat_df):,}")
    print(f"    Feature columns   : {XGB_FEATURE_COLS}")

    # Show risk values for a sample of accounts
    print(f"\n    Country risk sample (first 8 accounts):")
    print(f"    {'Account':<16} {'Sender Country':<18} {'SenderRisk':>10} "
          f"{'Receiver Country':<18} {'RecvRisk':>8} {'Corridor Key':<25} {'CorrMult':>8}")
    print("    " + "─" * 110)
    for _, r in feat_df.head(8).iterrows():
        print(f"    {r['account_id']:<16} {r['_sender_country']:<18} "
              f"{r['sender_region_risk']:>10.2f} {r['_receiver_country']:<18} "
              f"{r['receiver_region_risk']:>8.2f} {r['_corridor_key']:<25} "
              f"{r['corridor_multiplier']:>8.2f}")

    # 3. Load XGBoost ──────────────────────────────────────────────────────────
    print(f"\n[3] Loading XGBoost model: {XGB_MODEL}")
    with open(XGB_MODEL, "rb") as f:
        xgb_model = pickle.load(f)
    print(f"    Model loaded ✓  (threshold = {XGB_THRESHOLD})")

    # 4. Score ─────────────────────────────────────────────────────────────────
    print(f"\n[4] Scoring {len(feat_df):,} accounts …")
    X   = feat_df[XGB_FEATURE_COLS].values
    probs = xgb_model.predict_proba(X)[:, 1]

    feat_df["suspicion_score"] = probs
    feat_df["flagged"]         = probs >= XGB_THRESHOLD

    total_flagged = feat_df["flagged"].sum()
    print(f"    Flagged (score ≥ {XGB_THRESHOLD}) : {total_flagged:,} / {len(feat_df):,} accounts")

    # 5. Show top suspicious accounts ─────────────────────────────────────────
    top_df = feat_df.sort_values("suspicion_score", ascending=False).head(top_n)
    print(f"\n[5] Top {top_n} suspicious accounts:")
    print(f"\n    {'Account':<16} {'Score':>6}  {'Flag':>5}  "
          f"{'SendRisk':>8}  {'RecvRisk':>8}  {'Corridor':>8}  "
          f"{'in_txn':>6}  {'out_txn':>7}  {'fwd%':>5}  {'corridor_key'}")
    print("    " + "─" * 120)
    for _, r in top_df.iterrows():
        flag = "🚨" if r["flagged"] else "  "
        print(f"    {r['account_id']:<16} {r['suspicion_score']:>6.3f}  {flag}  "
              f"{r['sender_region_risk']:>8.2f}  {r['receiver_region_risk']:>8.2f}  "
              f"{r['corridor_multiplier']:>8.2f}  "
              f"{int(r['in_txn_5m']):>6}  {int(r['out_txn_5m']):>7}  "
              f"{r['pct_forwarded_60s']:>5.2f}  {r['_corridor_key']}")

    # 6. Score distribution ────────────────────────────────────────────────────
    print(f"\n[6] Score distribution:")
    bins = [0.0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.01]
    labels = ["0.0-0.1", "0.1-0.2", "0.2-0.3", "0.3-0.5", "0.5-0.7", "0.7-1.0"]
    counts, _ = np.histogram(probs, bins=bins)
    for label, count in zip(labels, counts):
        bar = "█" * int(count / max(counts) * 30)
        print(f"    {label:>9}  {bar:<30}  {count:>5}")

    print("\n" + "═" * 65 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Layer 1 XGBoost Test")
    parser.add_argument("--rows", type=int, default=3500,
                        help="Number of transaction rows to load (default=3500)")
    parser.add_argument("--top",  type=int, default=15,
                        help="Top-N suspicious accounts to display (default=15)")
    args = parser.parse_args()
    run(n_rows=args.rows, top_n=args.top)
