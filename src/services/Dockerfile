FROM python:3.13.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app

RUN useradd --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin appuser

COPY src/services/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser src ./src
RUN find /app/src -type d -exec chmod 755 {} + \
    && find /app/src -type f -exec chmod 644 {} +

# 비루트 실행 — 매니페스트 securityContext(runAsUser: 10001)와 UID 정렬.
# (root 로 의존성 설치/소스 복사 후 비특권 사용자로 전환; 8000/9100 은 비특권 포트)
USER 10001

EXPOSE 8000 9100

CMD ["python", "src/services/gateway/api-gateway/app.py"]
