# Mule Detector Backend

A FastAPI-based data streaming service that processes transaction data using Kafka for asynchronous event processing. This backend streams transaction rows from a CSV dataset, produces them to Kafka topics, and provides Server-Sent Event (SSE) streams for real-time monitoring.


## Features

- **Transaction Streaming**: Load and stream transaction data from CSV in configurable chunks
- **Kafka Integration**: Automatic production of masked transactions to Kafka topics
- **Real-time SSE Output**: Server-Sent Events for client-side streaming
- **Data Masking & Enrichment**: PII masking, risk scoring, and behavioral enrichment before Kafka production and API output
- **Behavioral Metrics via Redis**: Real-time transaction/receiver counts and sums per account
- **Risk Table Integration**: Pincode and channel risk scores loaded from CSV
- **Structured Logging**: JSON-formatted logs with `structlog`
- **Docker & Docker Compose**: Pre-configured containerized services (Kafka, Redis, Kafka-UI)


## Prerequisites

- **Python 3.12+**
- **uv** (package manager): [Install uv](https://docs.astral.sh/uv/getting-started/)
- **Docker & Docker Compose** (for running Kafka, Redis, and Kafka-UI)

## Project Setup

### 1. Clone & Install Dependencies

```bash
# Install Python dependencies using uv
make install
```

This runs: `uv pip install -e .`

### 2. Verify Installation

```bash
# Check if all dependencies are installed
uv pip list | grep -E "fastapi|confluent|pandas|structlog"
```

## Running the Development Server Locally

The development server connects to Kafka running in Docker containers.


### 1. Start Kafka, Redis & Kafka-UI (in Docker)

In one terminal, spin up the full stack:

```bash
docker compose up -d
```

This starts:

- **Kafka Broker** on `localhost:9092` (localhost) / `kafka:29092` (internal)
- **Redis** on `localhost:6379`
- **Kafka UI** on `http://localhost:8080`

Verify Kafka is healthy:

```bash
docker compose ps
# Look for "healthy" status on the kafka service
```

### 2. Run the FastAPI Server (in Development Mode)

In another terminal, start the development server:

```bash
make dev
```

This runs: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

The server will:

- Load the CSV dataset (`data/transactions_v2.csv`)
- Start the Kafka producer
- Listen on `http://0.0.0.0:8000`

You should see logs like:

```
INFO:     Started server process
app_starting app=mule_detector_data_streamer env=development log_level=INFO
dataset_loaded rows=<number>
kafka_producer_started servers=kafka:9092
```


## Enrichment & Output Format

Each streamed transaction is enriched with:
- Masked and hashed fields (PII-safe)
- Risk scores (from `app/data/risk_tables.csv`)
- Real-time behavioral metrics (from Redis)
- Timestamps and derived fields

Example output:
```
{
  "txn_id": "TXN00085271",
  "account_hash": "1ac9a3330052c8fd",
  "name_masked": "T****",
  "mobile_hash": "f2a56a5ce0a731a3",
  "pincode": "600046",
  "account_product_type": "Savings",
  "narration": "IMPS/706885390271/Wasim",
  "amount": 28641.0,
  "timestamp": 1754927728,
  "produced_at": "2026-03-31T06:24:36Z",
  "channel": "IMPS",
  "receiver_ref": "",
  "amount_log": 10.263,
  "channel_risk": 0.3,
  "pincode_risk": 0.1,
  "txn_count_1h": 3,
  "txn_count_6h": 7,
  "txn_count_24h": 12,
  "amount_sum_1h": 14230,
  "amount_sum_6h": 31540,
  "amount_sum_24h": 58900,
  "unique_receivers_1h": 2,
  "unique_receivers_6h": 5,
  "unique_receivers_24h": 8,
  "enriched_at": "2026-03-31T06:24:36.681727Z"
}
```

## Redis Setup & Usage

- Redis is used to store and fetch real-time behavioral metrics for each account_hash.
- Metrics include: txn_count_1h, amount_sum_6h, unique_receivers_24h, etc.
- To populate Redis for all accounts in your dataset, run:

```bash
python scripts/populate_redis_for_all_accounts.py
```

This script reads all account numbers from your CSV, computes their hashes, and sets test values for all metrics.

## Risk Table Setup

- Risk scores for pincodes and channels are loaded from `app/data/risk_tables.csv`.
- You can edit this CSV to add/update risk values as needed.

Example:
```
type,key,value
pincode,600001,0.15
pincode,600002,0.10
... (many more) ...
channel,UPI,0.45
channel,IMPS,0.35
... (many more) ...
```

## Performance Optimizations

- Redis metrics are fetched in batch per chunk (not per row) for low latency.
- Masking and enrichment are optimized for speed.
- Kafka production is non-blocking per row.
- Tune `chunk_size` and `delay_seconds` in your API request for best throughput.

## Handoff for GNN Model Integration

- The enriched transaction output (see above) is ready to be consumed by downstream systems, including a GNN model.
- To integrate, consume the SSE stream or Kafka topic and feed the enriched JSON objects to your model pipeline.
- All enrichment logic, risk, and behavioral features are documented above.

## API Endpoints

### Health Check

```bash
curl http://localhost:8000/api/v1/health
```

### Stream Transactions to Kafka

Start streaming transactions to Kafka and receive SSE events:

```bash
curl -X POST http://localhost:8000/api/v1/data/stream \
  -H "Content-Type: application/json" \
  -d '{
    "chunk_size": 10,
    "delay_seconds": 1.0,
    "max_rows": 100
  }'
```

This streams data in chunks of 10 rows, waiting 1 second between chunks, up to 100 rows total.

**Response Format**: Server-Sent Events (plain text/event-stream)

```
data: {"rows": [{...transaction1...}, {...transaction2...}], "count": 10}

data: {"rows": [{...}, {...}], "count": 10}

...
```

### Dataset Status

```bash
curl http://localhost:8000/api/v1/data/stream/status
```

Response:

```json
{
  "is_loaded": true,
  "total_rows": 10000,
  "csv_path": "data/transactions_v2.csv"
}
```

## Monitoring Kafka

### Open Kafka UI

Open your browser and go to:

```
http://localhost:8080
```

Kafka UI will show:

- Kafka cluster health
- Topics created (e.g., `transactions.raw`)
- Messages per topic
- Consumer groups
- Partition details

### Watch Kafka Logs (Docker)

View Kafka broker logs:

```bash
docker compose logs -f kafka
```

Example output:

```
kafka  | [2026-03-30 00:00:00,123] INFO [KafkaServer id=1] started (kafka.server.KafkaServer)
```

### Consume Messages from Kafka (CLI)

If you want to consume messages from the `transactions.raw` topic:

```bash
docker compose exec kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic transactions.raw \
  --from-beginning
```

This will print all messages on the topic in real-time.

## Docker & Container Management

### Build Docker Image

```bash
make build
```

This builds: `docker build -t mule-detector-backend .`

### Run Container Locally

```bash
make run
```

This runs: `docker run -p 8000:8000 mule-detector-backend`

**Note**: When running in Docker, ensure the container can reach Kafka (`kafka:9092` internally).

### Start Full Stack (Docker Compose)

```bash
# Start all services in background
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

## Code Formatting & Linting

### Format Code

```bash
make format
```

This runs: `uv run ruff format app/`

### Lint Code

```bash
make lint
```

This runs: `uv run ruff check app/`

## Project Structure

```
mule-detector-backend/
├── main.py                          # FastAPI app entry point
├── Dockerfile                       # Container image definition
├── docker-compose.yml              # Kafka + Kafka-UI services
├── Makefile                        # Development commands
├── pyproject.toml                  # Python project config
├── README.md                       # This file
├── data/
│   └── transactions_v2.csv        # Sample transaction dataset
└── app/
    ├── __init__.py
    ├── core/
    │   ├── config.py              # Settings & configuration
    │   └── logging.py             # Structured logging setup
    ├── api/
    │   ├── middleware/
    │   │   └── logging.py         # HTTP request/response logging
    │   └── v1/
    │       ├── api.py
    │       ├── dependencies/
    │       │   ├── simulator.py   # SimulatorService dependency
    │       │   └── kafka.py       # KafkaProducerService dependency
    │       └── routers/
    │           ├── health.py      # Health check endpoints
    │           └── stream.py      # Transaction streaming endpoint
    ├── schemas/
    │   ├── common.py              # Common response schemas
    │   └── transaction.py         # Transaction request/response schemas
    └── services/
        ├── kafka_service.py       # Kafka producer wrapper
        ├── masking_service.py     # PII masking utilities
        └── simulator_service.py   # CSV data streaming service
```

## Configuration

Settings are defined in `app/core/config.py` and can be overridden via environment variables or `.env` file:

```env
# Application
APP_NAME=mule_detector_data_streamer
APP_VERSION=0.1.0
APP_ENV=development
LOG_LEVEL=INFO
HOST=0.0.0.0
PORT=8000

# Data
CSV_PATH=data/transactions_v2.csv
TRANSACTIONS_PER_SECOND=10
SIMULATOR_BATCH_SIZE=50

# Kafka
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
KAFKA_TOPIC_RAW=transactions.raw
KAFKA_TOPIC_ENRICHED=transactions.enriched
KAFKA_TOPIC_SCORED=transactions.scored
KAFKA_TOPIC_DLQ=transactions.dlq
KAFKA_NUM_PARTITIONS=6
KAFKA_REPLICATION_FACTOR=1
KAFKA_GROUP_ID=mule-detector-consumer
```

## Common Workflows

### Complete Local Development Setup

```bash
# 1. Install dependencies
make install

# 2. Start Kafka & Kafka-UI
docker compose up -d

# 3. Verify Kafka is healthy
docker compose ps

# 4. Run the development server
make dev

# 5. (In another terminal) Start streaming data to Kafka
curl -X POST http://localhost:8000/api/v1/data/stream \
  -H "Content-Type: application/json" \
  -d '{"chunk_size": 10, "delay_seconds": 0.5}'

# 6. (In browser) Monitor Kafka topics
# Visit: http://localhost:8080
```

### Stop Everything

```bash
# Stop the Kafka stack
docker compose down

# Stop the development server
# (Press Ctrl+C in the terminal running `make dev`)
```

### Debug Kafka Connection Issues

```bash
# Check if Kafka is running and healthy
docker compose ps

# Check Kafka logs
docker compose logs kafka | tail -20

# Test Kafka connectivity from your local machine
docker compose exec kafka kafka-broker-api-versions --bootstrap-server kafka:9092

# List all topics in Kafka
docker compose exec kafka kafka-topics --list --bootstrap-server kafka:9092
```

## Troubleshooting

### "Dataset not loaded" Error (503)

- Check that `data/transactions_v2.csv` exists
- Verify CSV_PATH in config points to the correct file
- Check server logs for file loading errors

### "Kafka connection refused"

- Ensure `docker compose up -d` is running
- Wait 30+ seconds for Kafka to be healthy (check `docker compose ps`)
- Verify `KAFKA_BOOTSTRAP_SERVERS` is set to `kafka:9092`

### No messages appearing in Kafka UI

- Messages are produced asynchronously; small delays are normal
- Check server logs for `kafka_delivered` or `kafka_delivery_failed` entries
- Verify the topic name matches `KAFKA_TOPIC_RAW` (default: `transactions.raw`)

### Port Already in Use

If port 8000 or 9092 is already in use:

```bash
# Find process using port 8000
lsof -i :8000

# Find process using port 9092
lsof -i :9092

# Kill the process
kill -9 <PID>
```

## API Documentation

Once the server is running, view interactive API docs at:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Development Tips

1. **Live Reload**: Changes to Python files automatically reload the server (via `--reload` flag)
2. **Structured Logs**: Check logs for detailed `stream_request_received`, `chunk_yielded`, and `kafka_delivered` entries
3. **Kafka UI Refresh**: Kafka UI updates every few seconds; manually refresh if needed
4. **Consumer Testing**: Use `kafka-console-consumer` to verify messages are being produced correctly

## License

(Add your license here)

## Support

For issues or questions, check logs and refer to the Troubleshooting section above.
