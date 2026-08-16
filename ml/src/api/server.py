import time
import json
import psutil
from threading import Thread
from flask import Flask, jsonify, Response, request
from flask_cors import CORS
from queue import Queue, Empty

app = Flask(__name__)
CORS(app)

# --- Shared State ---
# These are mutated directly by run_production_demo.py
pipeline_state = {
    "store": None,
    "all_rings": [],
    "metrics": {
        "xgboostLatency": 0,
        "gnnLatency": 0,
        "topicThroughput": 0
    }
}

clients_metrics = []
clients_alerts = []

# SSE format helper
def sse_message(data, event="message"):
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"

import os
from flask import send_from_directory

@app.route("/ring_images/<path:filename>")
def serve_ring_image(filename):
    outputs_dir = os.path.join(os.path.dirname(__file__), '../../outputs/cluster_images')
    file_path = os.path.join(outputs_dir, filename)
    if not os.path.exists(file_path):
        try:
            images = os.listdir(outputs_dir)
            if images:
                return send_from_directory(outputs_dir, images[0])
        except Exception:
            pass
    return send_from_directory(outputs_dir, filename)

@app.route("/api/v1/rings")
def get_rings():
    """
    Format each ring matching the requested UI schema for alerts.
    """
    results = []
    status_choices = ["new", "investigating", "escalated", "closed"]
    priority_choices = ["critical", "high", "medium", "low"]
    
    for i, ring in enumerate(pipeline_state["all_rings"]):
        status = status_choices[i % len(status_choices)]
        
        risk_score = ring.get("risk_score", 0.98)
        if risk_score >= 0.9: priority = "critical"
        elif risk_score >= 0.75: priority = "high"
        elif risk_score >= 0.5: priority = "medium"
        else: priority = "low"
        
        image_name = ring.get('image_file')
        if not image_name or str(image_name).startswith('http'):
            image_name = f"{ring.get('ring_id')}.png"
            
        results.append({
            "ring_id": ring.get("ring_id"),
            "image_file": image_name,
            "status": status,
            "priority": priority,
            "assigned_analyst": "System Analyst" if status != "new" else None,
            "short_message": f"Suspicious {ring.get('pattern', 'activity')} involving {ring.get('account_count', 0)} accounts.",
            "pattern": ring.get("pattern", "UNKNOWN_SUSPICIOUS"),
            "risk_score": risk_score,
            "is_novel": ring.get("is_novel", False),
            "confidence": ring.get("confidence", 0.96),
            "account_count": ring.get("account_count", 0),
            "total_amount_blocked": ring.get("total_amount_blocked", 0),
            "transaction_count": ring.get("transaction_count", 0),
            "accounts": list(ring.get("all_accounts", [])),
            "flagged_accounts": list(ring.get("seed_accounts", [])),
            "detected_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        })
    return jsonify(results)

@app.route("/api/v1/graph-stream")
def graph_stream():
    """
    Returns batches of transactions for the frontend graph integration.
    """
    store = pipeline_state.get("store")
    since_timestamp = request.args.get("since_timestamp")
    
    txns_formatted = []
    
    if store:
        with store._lock:
            all_txns = list(store._all_txns)
            
            if since_timestamp:
                all_txns = [t for t in all_txns if str(t.get("timestamp", "")) > since_timestamp]
                
            # Get last 50 entries
            recent_txns = all_txns[-50:]
            
            for t in recent_txns:
                txns_formatted.append({
                    "id": str(t.get("transaction_id", "")),
                    "sender_hash": str(t.get("sender_account_id", "")),
                    "receiver_hash": str(t.get("receiver_account_id", "")),
                    "amount": float(t.get("amount", 0)),
                    "channel": str(t.get("transaction_type", "UPI")),
                    "timestamp": str(t.get("timestamp", time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))
                })
                
    return jsonify({"transactions": txns_formatted})

case_notes_db = {}

@app.route("/api/v1/alerts/<alert_id>/notes", methods=["GET"])
def get_notes(alert_id):
    notes = case_notes_db.get(alert_id, [
        {"id": "sys-1", "timestamp": "14:32", "author": "System", "content": "XGBoost Layer-1 flagged initial seeds based on region/velocity triggers."},
        {"id": "sys-2", "timestamp": "14:18", "author": "System", "content": "GNN Layer-2 performed Louvain community detection and identified subgraph."}
    ])
    return jsonify(notes)

@app.route("/api/v1/alerts/<alert_id>/notes", methods=["POST"])
def add_note(alert_id):
    data = request.json
    notes = case_notes_db.setdefault(alert_id, [
        {"id": "sys-1", "timestamp": "14:32", "author": "System", "content": "XGBoost Layer-1 flagged initial seeds based on region/velocity triggers."},
        {"id": "sys-2", "timestamp": "14:18", "author": "System", "content": "GNN Layer-2 performed Louvain community detection and identified subgraph."}
    ])
    note = {
        "id": f"note_{len(notes)}",
        "timestamp": time.strftime("%H:%M"),
        "author": "Analyst",
        "content": data.get("content", "")
    }
    notes.append(note)
    return jsonify(note)

@app.route("/api/v1/alerts/<alert_id>/actions/freeze", methods=["POST"])
def action_freeze(alert_id):
    return jsonify({"status": "success", "message": "Accounts frozen"})

@app.route("/api/v1/alerts/<alert_id>/actions/sar", methods=["POST"])
def action_sar(alert_id):
    return jsonify({"status": "success", "message": "SAR generated"})

@app.route("/api/v1/alerts/<alert_id>/actions/escalate", methods=["POST"])
def action_escalate(alert_id):
    return jsonify({"status": "success", "message": "Alert escalated"})

@app.route("/api/v1/alerts/<alert_id>/actions/false-positive", methods=["POST"])
def action_false_positive(alert_id):
    return jsonify({"status": "success", "message": "Alert closed as false positive"})

@app.route("/api/v1/accounts/search")
def account_search():
    pan_hash = request.args.get("panHash", "UNKNOWN")
    return jsonify({
        "panHash": pan_hash,
        "deviceIds": ["DEV-" + pan_hash[:4]],
        "wallets": ["WAL-" + pan_hash[:4]],
        "atmCards": [],
        "ips": ["192.168.1.1"],
        "linkedBeneficiaries": 47,
        "riskScore": 94
    })

@app.route("/api/v1/graph-investigation/<ring_id>")
def get_graph(ring_id):
    all_rings = pipeline_state["all_rings"]
    for r in all_rings:
        if r.get("ring_id") == ring_id:
            nodes = []
            for acc in r.get("seed_accounts", []):
                nodes.append({"id": acc, "type": "account", "label": acc, "risk": "critical"})
            for acc in r.get("all_accounts", []):
                if acc not in r.get("seed_accounts", []):
                    nodes.append({"id": acc, "type": "account", "label": acc, "risk": "medium"})
            return jsonify({"nodes": nodes, "edges": []})
            
    return jsonify({
        "nodes": [{"id": "ACC-001", "type": "account", "label": "Mule Hub", "risk": "critical"}],
        "edges": []
    })

@app.route("/api/v1/risk-scores/global")
def risk_global():
    return jsonify({
        "fanIn": 89,
        "fanOut": 94,
        "hopDepth": 72,
        "fragmentation": 85,
        "structuring": 91,
        "layeringComplexity": 78,
        "jurisdictionRisk": 83,
        "sanctionsBehaviour": 67,
        "gnnConfidence": 96
    })

@app.route("/api/v1/payment-rails/metrics")
def payment_metrics():
    return jsonify({
        "txnVolumeSpikes": [
            { "time": "00:00", "volume": 2400, "flagged": 120 },
            { "time": "04:00", "volume": 3100, "flagged": 90 },
            { "time": "08:00", "volume": 5200, "flagged": 230 },
            { "time": "12:00", "volume": 4800, "flagged": 110 },
            { "time": "16:00", "volume": 6100, "flagged": 340 }
        ],
        "failureSpikes": [
            { "time": "00:00", "upi": 0.2, "wallet": 0.3, "atm": 0.5 },
            { "time": "04:00", "upi": 0.1, "wallet": 0.2, "atm": 0.3 },
            { "time": "08:00", "upi": 0.4, "wallet": 0.5, "atm": 0.8 },
            { "time": "12:00", "upi": 0.2, "wallet": 0.3, "atm": 0.4 },
            { "time": "16:00", "upi": 0.6, "wallet": 0.8, "atm": 1.2 }
        ],
        "railStats": {
            "upi": {
                "volume": 40000000,
                "anomalyRate": 2.4,
                "latency": 12,
                "failures": 0.3,
                "muleRoutes": 41,
                "abuseScore": 78,
                "txns": 12800000
            },
            "imps": {
                "volume": 25000000,
                "anomalyRate": 1.8,
                "latency": 45,
                "failures": 0.1,
                "muleRoutes": 22,
                "abuseScore": 62,
                "txns": 8200000
            },
            "neft": {
                "volume": 150000000,
                "anomalyRate": 0.5,
                "latency": 3600,
                "failures": 0.05,
                "muleRoutes": 8,
                "abuseScore": 34,
                "txns": 1500000
            },
            "wallet": {
                "volume": 8500000,
                "anomalyRate": 4.1,
                "latency": 8,
                "failures": 1.2,
                "muleRoutes": 89,
                "abuseScore": 92,
                "txns": 4500000
            },
            "atm": {
                "volume": 12000000,
                "anomalyRate": 3.2,
                "latency": 150,
                "failures": 2.1,
                "muleRoutes": 54,
                "abuseScore": 85,
                "txns": 3200000
            },
            "branch": {
                "volume": 200000000,
                "anomalyRate": 0.2,
                "latency": 86400,
                "failures": 0.01,
                "muleRoutes": 3,
                "abuseScore": 12,
                "txns": 400000
            }
        },
        "transitionMatrix": [
            { "from": "UPI", "upi": "-", "imps": 12, "neft": 3, "wallet": 34, "atm": 8, "branch": 1 },
            { "from": "IMPS", "upi": 23, "imps": "-", "neft": 8, "wallet": 15, "atm": 5, "branch": 2 },
            { "from": "NEFT", "upi": 40, "imps": 15, "neft": "-", "wallet": 5, "atm": 2, "branch": 10 },
            { "from": "Wallet", "upi": 45, "imps": 8, "neft": 1, "wallet": "-", "atm": 12, "branch": 0 },
            { "from": "ATM", "upi": 0, "imps": 0, "neft": 0, "wallet": 0, "atm": "-", "branch": 100 },
            { "from": "Branch", "upi": 10, "imps": 25, "neft": 60, "wallet": 2, "atm": 1, "branch": "-" }
        ]
    })

@app.route("/api/v1/sars")
def get_sars():
    return jsonify([{
        "id": "SAR-2026-XYZ",
        "date": "2026-04-06",
        "bank": "Multiple",
        "type": "structuring_fanout",
        "entities": 47,
        "confidence": 96,
        "status": "Filed"
    }])

@app.route("/api/v1/sars/<report_id>/export")
def export_sar(report_id):
    import time
    
    all_rings = pipeline_state.get("all_rings", [])
    store = pipeline_state.get("store")
    
    target_ring = None
    for r in all_rings:
        if r.get("ring_id", "") in report_id:
            target_ring = r
            break
            
    if not target_ring and all_rings:
        target_ring = all_rings[0]
        
    if target_ring:
        seed_accounts = target_ring.get("seed_accounts", target_ring.get("accounts", ["UNKNOWN"]))
        main_account = seed_accounts[0] if seed_accounts else "UNKNOWN"
        ring_id = target_ring.get("ring_id", "UNKNOWN")
        pattern = target_ring.get("pattern", "Suspicious Activity")
        total_blocked = target_ring.get("total_amount_blocked", 0)
        risk_score = target_ring.get("risk_score", 0.90)
        
        # Get real transactions
        txns = []
        if store and main_account != "UNKNOWN":
            df = store.get_transactions_for_accounts([main_account])
            if not df.empty:
                df = df.sort_values(by="timestamp", ascending=False).head(5)
                for _, row in df.iterrows():
                    txns.append({
                        "txn_id": str(row.get("transaction_id", "TXN-000")),
                        "timestamp": str(row.get("timestamp", time.strftime('%Y-%m-%dT%H:%M:%SZ'))),
                        "amount": float(row.get("amount", 0)),
                        "currency": "INR",
                        "channel": str(row.get("transaction_type", "UPI")),
                        "sender_account": str(row.get("sender_account_id", "")),
                        "receiver_account": str(row.get("receiver_account_id", "")),
                        "location": str(row.get("sender_pincode", "Unknown")),
                        "risk_score": float(risk_score)
                    })
    else:
        main_account = "CUST-98231"
        ring_id = report_id
        pattern = "Structuring / Smurfing"
        total_blocked = 1250000
        risk_score = 0.92
        txns = [
          {
            "txn_id": "TXN-98121",
            "timestamp": "2026-04-05T09:15:22Z",
            "amount": 250000,
            "currency": "INR",
            "channel": "UPI",
            "sender_account": "ACCT-723182",
            "receiver_account": "ACCT-993211",
            "location": "Chennai",
            "risk_score": 0.92
          }
        ]

    return jsonify({
      "sar_report": {
        "report_metadata": {
          "report_id": report_id,
          "generated_timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          "reporting_institution": {
            "institution_name": "Example Bank Ltd",
            "institution_id": "BANK-001",
            "country": "India",
            "branch_code": "CHN001"
          },
          "report_type": "Suspicious Transaction",
          "risk_level": "High" if risk_score >= 0.8 else "Medium"
        },
        "subject_information": {
          "customer_id": f"CUST-UUID-{main_account[-4:]}",
          "name": "Target Entity (Masked)",
          "date_of_birth": "1992-03-14",
          "nationality": "Indian",
          "kyc_status": "Verified",
          "account_details": {
            "account_id": main_account,
            "account_type": "Savings",
            "account_opened_date": "2024-06-01",
            "account_status": "Active / Frozen"
          }
        },
        "suspicious_activity": {
          "activity_id": ring_id,
          "activity_type": pattern,
          "first_detected": txns[-1]["timestamp"] if txns else time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          "last_detected": txns[0]["timestamp"] if txns else time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          "total_transactions_flagged": int(max(len(txns), target_ring.get('account_count', 0)*2) if target_ring else 7),
          "total_amount": float(total_blocked),
          "currency": "INR"
        },
        "transactions": txns,
        "risk_indicators": {
          "ml_model_score": float(risk_score),
          "rules_triggered": [
            "HIGH_FREQUENCY_TRANSFERS",
            "NEW_BENEFICIARY_RISK",
            "UNUSUAL_TRANSACTION_VOLUME"
          ],
          "geolocation_anomaly": False,
          "device_risk": "Medium"
        },
        "narrative": {
          "summary": f"The account {main_account} showed suspicious {pattern} patterns involving {len(txns)} transactions across the network.",
          "analysis": "Machine learning model flagged the pattern as highly indicative of mule account activity. GNN Engine detected community structures.",
          "recommendation": "Further investigation recommended. Temporary monitoring or account restriction may be required."
        },
        "evidence": {
          "logs_reference": [
            f"alert_{ring_id}_log_1"
          ],
          "model_version": "fraud-detection-xgb-v3.2",
          "data_sources": [
            "transaction_stream",
            "gnn_alerts"
          ]
        },
        "compliance_review": {
          "analyst_id": "System",
          "review_status": "Pending",
          "review_notes": "",
          "submitted_to_regulator": False
        }
      }
    })

@app.route("/api/v1/analyst-metrics")
def get_analyst_metrics():
    return jsonify({
        "name": "Priya S.",
        "cases": 47,
        "avgTime": "3.2h",
        "accuracy": "94%",
        "sars": 38
    })

@app.route("/api/v1/reports/metrics")
def reports_metrics():
    return jsonify({
        "sarReports": [
            {
                "id": "SAR-2026-XYZ",
                "date": "2026-04-06",
                "bank": "Multiple",
                "type": "structuring_fanout",
                "entities": 47,
                "confidence": 96,
                "status": "Filed"
            },
            {
                "id": "SAR-2026-ABC",
                "date": "2026-04-07",
                "bank": "Global Bank",
                "type": "smurfing_ring",
                "entities": 12,
                "confidence": 88,
                "status": "Pending"
            },
            {
                "id": "SAR-2026-DEF",
                "date": "2026-04-07",
                "bank": "Regio Bank",
                "type": "rapid_movement",
                "entities": 5,
                "confidence": 92,
                "status": "Draft"
            }
        ],
        "weeklyTrend": [
            { "week": "W1", "total": 42, "critical": 12, "filed": 38 },
            { "week": "W2", "total": 51, "critical": 18, "filed": 45 },
            { "week": "W3", "total": 48, "critical": 15, "filed": 40 },
            { "week": "W4", "total": 55, "critical": 20, "filed": 48 },
            { "week": "W5", "total": 60, "critical": 22, "filed": 52 },
            { "week": "W6", "total": 65, "critical": 25, "filed": 58 }
        ],
        "modelMetrics": [
            { "model": "XGBoost v3.2", "precision": "94.2%", "recall": "91.8%", "f1": "93.0%", "auc": "0.967" },
            { "model": "GNN v2.1", "precision": "96.1%", "recall": "89.4%", "f1": "92.6%", "auc": "0.974" }
        ],
        "analystMetrics": [
            { "name": "Priya S.", "cases": 47, "avgTime": "3.2h", "accuracy": "94%", "sars": 38 },
            { "name": "Rahul M.", "cases": 52, "avgTime": "2.8h", "accuracy": "91%", "sars": 41 },
            { "name": "Anita K.", "cases": 38, "avgTime": "3.5h", "accuracy": "96%", "sars": 31 }
        ]
    })

@app.route("/results/<batch_id>")
def get_results(batch_id):
    from collections import defaultdict
    import pandas as pd
    
    # Load config from models directory
    config_path = os.path.join(os.path.dirname(__file__), '../../models/xgboost/risk_config.json')
    try:
        with open(config_path, 'r') as f:
            risk_cfg = json.load(f)
    except Exception:
        risk_cfg = {"fatf_tier": {}, "country_risk": {}, "corridor_multiplier": {}}

    fatf_tier = risk_cfg.get("fatf_tier", {})
    country_risk_map = risk_cfg.get("country_risk", {})
    
    flags = {
        "North Korea": "🇰🇵", "Iran": "🇮🇷", "Myanmar": "🇲🇲", "Syria": "🇸🇾",
        "UAE": "🇦🇪", "Pakistan": "🇵🇰", "Russia": "🇷🇺", "India": "🇮🇳", "USA": "🇺🇸",
        "Afghanistan": "🇦🇫", "Kuwait": "🇰🇼", "Vietnam": "🇻🇳", "Yemen": "🇾🇪",
        "BVI": "🇻🇬", "Cayman Islands": "🇰🇾", "Nepal": "🇳🇵"
    }

    all_rings = pipeline_state.get("all_rings", [])
    store = pipeline_state.get("store")

    blacklist_exposure = defaultdict(float)
    greylist_exposure = defaultdict(float)
    blacklist_mules = defaultdict(int)
    greylist_mules = defaultdict(int)
    
    corridor_volume = defaultdict(float)
    corridor_alerts = defaultdict(int)
    
    # We define high_risk as anything in blacklist or greylist
    high_risk_jurisdictions_count = len([c for c, r in fatf_tier.items() if r in ("blacklist", "greylist")])
    fatf_blacklisted_count = len([c for c, r in fatf_tier.items() if r == "blacklist"])
    
    if store and all_rings:
        for ring in all_rings:
            accounts = ring.get("accounts", [])
            if not accounts: 
                accounts = getattr(ring, "all_accounts", getattr(ring, "accounts", []))
            
            if not accounts:
                continue
                
            df = store.get_transactions_for_accounts(accounts)
            if df is None or df.empty: 
                continue
            
            # Default to 'India' if country col is missing
            s_countries = df["sender_country"].values if "sender_country" in df.columns else ["India"] * len(df)
            r_countries = df["receiver_country"].values if "receiver_country" in df.columns else ["India"] * len(df)
            amounts = df["amount"].values if "amount" in df.columns else [0] * len(df)
            
            seen_for_ring = set()
            
            for s_c, r_c, amt in zip(s_countries, r_countries, amounts):
                s_c = str(s_c)
                r_c = str(r_c)
                amt = float(amt)
                
                tier_s = fatf_tier.get(s_c)
                tier_r = fatf_tier.get(r_c)
                
                if tier_s == "blacklist":
                    blacklist_exposure[s_c] += amt
                    seen_for_ring.add(("blacklist", s_c))
                elif tier_s == "greylist":
                    greylist_exposure[s_c] += amt
                    seen_for_ring.add(("greylist", s_c))
                    
                if tier_r == "blacklist":
                    blacklist_exposure[r_c] += amt
                    seen_for_ring.add(("blacklist", r_c))
                elif tier_r == "greylist":
                    greylist_exposure[r_c] += amt
                    seen_for_ring.add(("greylist", r_c))
                    
                # Corridors
                if s_c != r_c:
                    corridor = f"{s_c}->{r_c}"
                    corridor_volume[corridor] += amt
                    corridor_alerts[corridor] += 1
            
            # Count mules per region using ring detections
            for tier, c in seen_for_ring:
                if tier == "blacklist": 
                    blacklist_mules[c] += 1
                elif tier == "greylist": 
                    greylist_mules[c] += 1

    # Format outputs
    fatf_blacklist = []
    for c in [k for k, v in fatf_tier.items() if v == "blacklist"]:
        fatf_blacklist.append({
            "country": c,
            "risk": int(country_risk_map.get(c, 1.0) * 100),
            "exposure": float(blacklist_exposure.get(c, 0)),
            "sanctions": True,
            "flag": flags.get(c, "🏳️")
        })

    fatf_greylist = []
    for c in [k for k, v in fatf_tier.items() if v == "greylist"]:
        fatf_greylist.append({
            "country": c,
            "risk": int(country_risk_map.get(c, 0.5) * 100),
            "exposure": float(greylist_exposure.get(c, 0)),
            "trend": "up" if greylist_exposure.get(c, 0) > 0 else "stable",
            "mules": blacklist_mules.get(c, 0) + greylist_mules.get(c, 0),
            "flag": flags.get(c, "🏳️")
        })

    # Sanctions mock
    sanctions_overlap = [
        {
            "entity": "Al-Rashid Trading LLC",
            "type": "Entity",
            "list": "OFAC SDN",
            "country": "UAE",
            "matchScore": 97
        }
    ]

    suspicious_corridors = []
    for corr, vol in sorted(corridor_volume.items(), key=lambda x: x[1], reverse=True)[:10]:
        s_c, r_c = corr.split("->")
        suspicious_corridors.append({
            "from": s_c,
            "to": r_c,
            "volume": vol,
            "risk": int(risk_cfg.get("corridor_multiplier", {}).get(corr, 1.0) * 50),
            "alerts": corridor_alerts[corr],
            "type": "Hawala"
        })
        
    if not suspicious_corridors:
        suspicious_corridors = [
           {
                "from": "India",
                "to": "UAE",
                "volume": 30000000,
                "risk": 92,
                "alerts": 13,
                "type": "Hawala"
            }
        ]

    return jsonify({
        "jurisdiction_metrics": {
            "high_risk_jurisdictions_count": high_risk_jurisdictions_count,
            "fatf_blacklisted_count": fatf_blacklisted_count
        },
        "fatf_blacklist": fatf_blacklist,
        "fatf_greylist": fatf_greylist,
        "sanctions_overlap": sanctions_overlap,
        "suspicious_corridors": suspicious_corridors
    })

# SSE STREAMS
@app.route("/v1/stream/metrics")
def stream_metrics():
    def generate():
        q = Queue()
        clients_metrics.append(q)
        try:
            while True:
                pm = pipeline_state["metrics"]
                nodes_count = pipeline_state['store'].n_accounts if pipeline_state['store'] else 0
                edges_count = pipeline_state['store'].size if pipeline_state['store'] else 0
                
                payload = {
                    "infraHealth": {
                        "apiLatency": 12,
                        "xgboostLatency": pm.get("xgboostLatency", 0),
                        "gnnLatency": pm.get("gnnLatency", 0),
                        "cpuUsage": psutil.cpu_percent(),
                        "ramUsage": psutil.virtual_memory().percent,
                        "gpuUsage": 0,
                        "redisCacheHit": "98.2%",
                        "slaUptime": "99.97%",
                        "graphNodes": str(nodes_count),
                        "graphEdges": str(edges_count),
                        "dlqCount": 0
                    },
                    "kafkaTopics": [{
                        "topic": "transactions.raw",
                        "throughput": pm.get("topicThroughput", 0),
                        "lag": 0,
                        "partitions": 1
                    }],
                    "latencyTimeline": [{
                        "time": time.strftime("%H:%M:%S"),
                        "xgboost": pm.get("xgboostLatency", 0),
                        "gnn": pm.get("gnnLatency", 0),
                        "api": 12
                    }],
                    "shapFeatures": [
                        { "feature": "fan_out_velocity", "importance": 0.34 },
                        { "feature": "txn_fragmentation", "importance": 0.28 }
                    ]
                }
                yield sse_message(payload)
                time.sleep(1)
        except GeneratorExit:
            clients_metrics.remove(q)
    
    return Response(generate(), mimetype="text/event-stream")

@app.route("/v1/stream/alerts")
def stream_alerts():
    def generate():
        q = Queue()
        clients_alerts.append(q)
        try:
            while True:
                ring = q.get()
                alert = {
                    "id": f"ALT-{ring.get('ring_id', '000')}",
                    "priority": "critical" if ring.get("risk_score", 0) > 0.9 else "high",
                    "message": f"{ring.get('pattern', 'mule_ring')} detected: {ring.get('account_count', 0)} accounts",
                    "time": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                    "bank": "Multiple"
                }
                yield sse_message(alert)
        except GeneratorExit:
            if q in clients_alerts:
                clients_alerts.remove(q)
            
    return Response(generate(), mimetype="text/event-stream")

def broadcast_alert(ring):
    for q in clients_alerts:
        q.put(ring)

def run_flask():
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True, use_reloader=False)

def start_server_in_background(store, all_rings):
    pipeline_state["store"] = store
    pipeline_state["all_rings"] = all_rings
    thread = Thread(target=run_flask, daemon=True)
    thread.start()
    return pipeline_state, broadcast_alert
