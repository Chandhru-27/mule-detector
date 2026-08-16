"""
patch_country_columns.py
------------------------
Adds 'sender_country' and 'receiver_country' columns to transactions.csv.

Strategy (account-level assignment):
  - 85% of unique accounts → "India"
  - 15% of unique accounts → a high-risk country from risk_config.json
    (so the corridor risk and sender/receiver risk are non-trivial)

Each row inherits the country of its sender and receiver account.
This is stable: the same account always maps to the same country.

Updates:
  - data/aml_dataset/transactions.csv   (adds 2 columns, overwrites in-place)
  - data/aml_dataset/metadata.json      (updates schema)

Usage:
    python patch_country_columns.py
"""

import os, json, random
import pandas as pd
import numpy as np

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

ROOT      = os.path.dirname(os.path.abspath(__file__))
CSV_PATH  = os.path.join(ROOT, "data", "aml_dataset", "transactions.csv")
META_PATH = os.path.join(ROOT, "data", "aml_dataset", "metadata.json")
CFG_PATH  = os.path.join(ROOT, "models", "xgboost", "risk_config.json")

# ── Load files ────────────────────────────────────────────────────────────────
print("Loading transactions.csv …")
df = pd.read_csv(CSV_PATH)
print(f"  {len(df):,} rows  |  columns: {df.columns.tolist()}")

if "sender_country" in df.columns:
    print("  [INFO] Country columns already exist — re-patching.")
    df.drop(columns=["sender_country", "receiver_country"], errors="ignore", inplace=True)

with open(CFG_PATH) as f:
    risk_cfg = json.load(f)

# ── Build country pool ────────────────────────────────────────────────────────
# High-risk = score >= 0.4 in country_risk  (covers offshore, FATF greylist, etc.)
high_risk_countries = [
    c for c, score in risk_cfg["country_risk"].items()
    if isinstance(score, float) and score >= 0.4 and c not in ("India", "default")
]
print(f"\n  High-risk countries available: {len(high_risk_countries)}")
print(f"  Examples: {high_risk_countries[:8]}")

# ── Assign country per unique account (stable mapping) ───────────────────────
all_accounts = pd.unique(
    np.concatenate([df["sender_account_id"].values,
                    df["receiver_account_id"].values])
)
print(f"\n  Unique accounts: {len(all_accounts):,}")

intl_count = max(1, int(len(all_accounts) * 0.15))
intl_accounts = set(random.sample(all_accounts.tolist(), intl_count))

account_country = {}
for acc in all_accounts:
    if acc in intl_accounts:
        account_country[acc] = random.choice(high_risk_countries)
    else:
        account_country[acc] = "India"

intl_as_sender   = sum(1 for a in intl_accounts if account_country[a] != "India")
print(f"  Accounts assigned international country : {intl_count:,}  "
      f"({intl_count/len(all_accounts)*100:.1f}%)")

# ── Apply to DataFrame ────────────────────────────────────────────────────────
print("\n  Mapping countries to rows …")
df["sender_country"]   = df["sender_account_id"].map(account_country)
df["receiver_country"] = df["receiver_account_id"].map(account_country)

# Sanity: fill any unmapped (shouldn't happen)
df["sender_country"].fillna("India", inplace=True)
df["receiver_country"].fillna("India", inplace=True)

# ── Print sample distribution ─────────────────────────────────────────────────
print("\n  Sender country distribution (top 10):")
print(df["sender_country"].value_counts().head(10).to_string())
print("\n  Receiver country distribution (top 10):")
print(df["receiver_country"].value_counts().head(10).to_string())

# Count non-domestic corridors
non_dom = df[(df["sender_country"] != "India") | (df["receiver_country"] != "India")]
print(f"\n  Rows with at least one international party: {len(non_dom):,} "
      f"({len(non_dom)/len(df)*100:.1f}%)")

# ── Save ──────────────────────────────────────────────────────────────────────
print(f"\n  Saving → {CSV_PATH}")
df.to_csv(CSV_PATH, index=False)
print(f"  Saved. Final columns: {df.columns.tolist()}")

# ── Update metadata.json ──────────────────────────────────────────────────────
with open(META_PATH) as f:
    meta = json.load(f)

schema = meta.get("schema", [])
for col in ["sender_country", "receiver_country"]:
    if col not in schema:
        schema.append(col)
meta["schema"] = schema

meta["country_patch"] = {
    "patched_at"           : pd.Timestamp.now().isoformat(),
    "total_accounts"       : int(len(all_accounts)),
    "intl_accounts"        : int(intl_count),
    "intl_pct"             : round(intl_count / len(all_accounts) * 100, 2),
    "unknown_country_risk" : 0.9,
    "domestic_default"     : "India",
    "high_risk_threshold"  : 0.4,
}

with open(META_PATH, "w") as f:
    json.dump(meta, f, indent=2)
print("  metadata.json updated ✓")

print("\n  Done! ✓\n")
