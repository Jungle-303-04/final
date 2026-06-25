FROM python:3.13.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY eda_platform ./eda_platform

EXPOSE 8000

ENTRYPOINT ["python", "-m", "eda_platform.main"]
