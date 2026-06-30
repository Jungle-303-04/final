FROM python:3.13.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app

COPY src/services/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

EXPOSE 8000 9100

CMD ["python", "src/services/api-gateway/app.py"]
