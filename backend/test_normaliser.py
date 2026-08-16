import json, sys, csv, asyncio
sys.path.insert(0, '.')
from app.services.normaliser import ChannelNormaliser

async def test():
    n = ChannelNormaliser(master_db_path="data/master_db.json")
    await n.load()
    print(f"Loaded {len(n.accounts)} accounts, {len(n.upi_index)} UPI, {len(n.mobile_index)} mobiles")

    for channel, path, id_field in [
        ("NETBANKING", "data/channels/netbanking_transactions.csv", "debit_account_no"),
        ("UPI", "data/channels/upi_transactions.csv", "sender_vpa"),
        ("APP", "data/channels/app_transactions.csv", "sender_mobile"),
        ("WEB", "data/channels/web_transactions.csv", "from_account"),
    ]:
        with open(path) as f:
            reader = csv.DictReader(f)
            row = next(reader)
        result = n.normalise(row, channel)
        if result:
            print(f"  {channel}: OK  amount={result['amount']}  ts={result['timestamp']}  txn_id={result['txn_id'][:20]}")
        else:
            print(f"  {channel}: FAILED  id_val={row.get(id_field)}")

asyncio.run(test())
