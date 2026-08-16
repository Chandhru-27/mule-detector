# scripts/generate_risk_tables.py

from pathlib import Path
import csv

PINCODE_RISKS = [
    ("600001", 0.72), ("600002", 0.65), ("600004", 0.58), ("600006", 0.81),
    ("600007", 0.77), ("600010", 0.45), ("600011", 0.69), ("600015", 0.53),
    ("600017", 0.41), ("600019", 0.88), ("600020", 0.62), ("600025", 0.35),
    ("600026", 0.74), ("600028", 0.49), ("600029", 0.83), ("600032", 0.57),
    ("600040", 0.44), ("600042", 0.91), ("600046", 0.38), ("600053", 0.66),
    ("600063", 0.79), ("600082", 0.55), ("600091", 0.42), ("600097", 0.87),
    ("600100", 0.61), ("600101", 0.33), ("600102", 0.76), ("600103", 0.48),
    ("600104", 0.85), ("600105", 0.52),
]

CHANNEL_RISKS = [
    ("ATM",        0.75),
    ("UPI",        0.40),
    ("IMPS",       0.45),
    ("APP",        0.50),
    ("WEB",        0.30),
    ("NEFT",       0.20),
    ("RTGS",       0.15),
    ("NETBANKING", 0.25),
    ("OTHER",      0.50),
]


def generate(output_path: str = "data/risk_tables.csv") -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    rows = []

    for pincode, risk in PINCODE_RISKS:
        rows.append({"type": "pincode", "key": pincode, "value": risk})

    for channel, risk in CHANNEL_RISKS:
        rows.append({"type": "channel", "key": channel, "value": risk})

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["type", "key", "value"])
        writer.writeheader()
        writer.writerows(rows)

    pincode_count = sum(1 for r in rows if r["type"] == "pincode")
    channel_count = sum(1 for r in rows if r["type"] == "channel")

    print(f"Generated {len(rows)} rows → {output_path}")
    print(f"  pincodes : {pincode_count}")
    print(f"  channels : {channel_count}")


if __name__ == "__main__":
    generate()