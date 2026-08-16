import redis
import os
import pandas as pd
import hashlib

# Configure connection (adjust if needed)
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
CSV_PATH = os.getenv("CSV_PATH", "../data/transactions_v2.csv")

r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)

def sha(value: str, salt: str = "mule_detector_v1") -> str:
    return hashlib.sha256(f"{value}{salt}".encode()).hexdigest()[:16]

def populate_for_all_accounts(csv_path):
    df = pd.read_csv(csv_path)
    account_numbers = df["account_number"].unique()
    for acc in account_numbers:
        account_hash = sha(str(acc))
        # Example: random or fixed test values
        r.set(f"txn_count_1h:{account_hash}", 3)
        r.set(f"txn_count_6h:{account_hash}", 7)
        r.set(f"txn_count_24h:{account_hash}", 12)
        r.set(f"amount_sum_1h:{account_hash}", 14230)
        r.set(f"amount_sum_6h:{account_hash}", 31540)
        r.set(f"amount_sum_24h:{account_hash}", 58900)
        r.set(f"unique_receivers_1h:{account_hash}", 2)
        r.set(f"unique_receivers_6h:{account_hash}", 5)
        r.set(f"unique_receivers_24h:{account_hash}", 8)
    print(f"Populated Redis for {len(account_numbers)} accounts.")

if __name__ == "__main__":
    populate_for_all_accounts(CSV_PATH)
