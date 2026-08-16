FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt \
    && pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126 \
    && pip install torch-scatter torch-sparse torch-cluster -f https://data.pyg.org/whl/torch-2.11.0+cu130.html \
    && pip install torch-spline-conv --no-build-isolation \
    && pip install torch-geometric

COPY . .

CMD ["python", "-u", "run_production_demo.py"]
