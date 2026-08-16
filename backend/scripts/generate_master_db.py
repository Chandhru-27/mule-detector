import json
import random
import hashlib
from pathlib import Path
import pandas as pd

random.seed(42)

TRANSACTION_PATH = "data/transactions.csv"

TAMIL_FIRST_NAMES = [
    "Arun","Dinesh","Elan","Gopal","Hari","Karthik","Kumar","Mani",
    "Nanda","Prabhu","Raja","Senthil","Tamil","Velu","Vijay",
    "Anand","Bala","Chandra","Durai","Ganesh","Ilango","Jagan",
    "Kaviya","Lakshmi","Meena","Nithya","Priya","Radha","Sangeetha"
]

BANKS = ["SBI","HDFC","ICICI","KOTAK","AXIS","BOI","CANARA","UNION"]
PRODUCT_TYPES = ["Savings","Current"]
PINCODES = [
"600001","600002","600004","600006","600007","600010",
"600011","600015","600017","600019","600020","600025",
"600026","600028","600029","600032","600040","600042"
]


def hash_value(val: str):
    return hashlib.sha256(val.encode()).hexdigest()[:16]


def generate_mobile():
    return str(random.randint(6000000000,9999999999))


def generate_upi(name):
    return name.lower() + str(random.randint(10,999)) + "@oksbi"


def build_master_db():

    df = pd.read_csv(TRANSACTION_PATH)

    accounts = set(df["sender_account_id"]).union(df["receiver_account_id"])

    master_accounts = {}
    upi_index = {}
    mobile_index = {}

    for acc in accounts:

        name = random.choice(TAMIL_FIRST_NAMES)
        mobile = generate_mobile()
        bank = random.choice(BANKS)

        upi = generate_upi(name)

        record = {
            "account_number": acc,
            "name": name,
            "mobile": mobile,
            "mobile_hash": hash_value(mobile),
            "upi_id": upi,
            "bank": bank,
            "pincode": random.choice(PINCODES),
            "account_product_type": random.choice(PRODUCT_TYPES)
        }

        master_accounts[acc] = record
        upi_index[upi] = acc
        mobile_index[mobile] = acc

    return {
        "accounts": master_accounts,
        "upi_index": upi_index,
        "mobile_index": mobile_index
    }


if __name__ == "__main__":

    Path("data").mkdir(exist_ok=True)

    db = build_master_db()

    with open("data/master_db.json","w") as f:
        json.dump(db,f,indent=2)

    print(f"Generated {len(db['accounts'])} accounts")
    print("Saved to data/master_db.json")