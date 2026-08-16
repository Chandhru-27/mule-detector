import csv
import json
import random
from pathlib import Path
import pandas as pd

random.seed(99)

TRANSACTION_PATH = "data/transactions.csv"

with open("data/master_db.json") as f:
    master = json.load(f)

accounts = master["accounts"]


def random_channel():
    return random.choice(["UPI","NETBANKING","APP","WEB"])


def write_csv(rows, path):

    Path(path).parent.mkdir(parents=True, exist_ok=True)

    with open(path,"w",newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} → {path}")


def generate():

    df = pd.read_csv(TRANSACTION_PATH)

    upi_rows = []
    netbank_rows = []
    app_rows = []
    web_rows = []

    for _, row in df.iterrows():

        sender = accounts[str(row["sender_account_id"])]
        receiver = accounts[str(row["receiver_account_id"])]

        row_timestamp = pd.to_datetime(row["timestamp"])
        timestamp_epoch = int(row_timestamp.timestamp())

        channel = random_channel()

        if channel == "UPI":

            upi_rows.append({
                "upi_txn_ref": f"UPI{random.randint(100000000000,999999999999)}",
                "sender_vpa": sender["upi_id"],
                "receiver_vpa": receiver["upi_id"],
                "amount": row["amount"],
                "txn_timestamp": timestamp_epoch,
                "upi_status": "SUCCESS"
            })


        elif channel == "NETBANKING":

            netbank_rows.append({
                "transaction_id": f"NB{random.randint(100000000,999999999)}",
                "debit_account_no": sender["account_number"],
                "credit_account_no": receiver["account_number"],
                "transaction_amount": row["amount"],
                "transaction_date": row["timestamp"]
            })


        elif channel == "APP":

            app_rows.append({
                "txn_reference": f"APP{random.randint(100000000,999999999)}",
                "sender_mobile": sender["mobile"],
                "receiver_mobile": receiver["mobile"],
                "transfer_amount": row["amount"],
                "initiated_at": timestamp_epoch
            })


        else:

            web_rows.append({
                "web_txn_id": f"WEB{random.randint(100000000,999999999)}",
                "from_account": sender["account_number"],
                "to_account": receiver["account_number"],
                "amount": row["amount"],
                "timestamp_epoch": timestamp_epoch,
                "currency": "INR"
            })


    write_csv(upi_rows,"data/channels/upi_transactions.csv")
    write_csv(netbank_rows,"data/channels/netbanking_transactions.csv")
    write_csv(app_rows,"data/channels/app_transactions.csv")
    write_csv(web_rows,"data/channels/web_transactions.csv")


if __name__ == "__main__":
    generate()