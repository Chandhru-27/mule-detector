dev:
	uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

prod:
	uv run uvicorn main:app --host 0.0.0.0 --port 8000

build:
	docker build -t mule-detector-backend .

run:
	docker run -p 8000:8000 mule-detector-backend

install:
	uv pip install -e .

lint:
	uv run ruff check app/

format:
	uv run ruff format app/

stream:
	curl -X POST http://localhost:8000/api/v1/data/stream \
	  -H "Content-Type: application/json" \
	  -d '{"chunk_size": 10, "delay_seconds": 0.5}'

multi-stream:
	curl -X POST http://localhost:8000/api/v1/multi-stream \
	  -H "Content-Type: application/json" \
	  -d '{"chunk_size": 5, "delay_seconds": 1.0}'
