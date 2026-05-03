FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Env settings
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system deps (optional)
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Run your module
CMD ["python", "-m", "app.main"]




#  docker build -t ai-worker .
# docker run --env-file .env ai-worker