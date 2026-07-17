"""워크스페이스 자격증명 암호화 — 원문 토큰을 DB/응답/로그에 남기지 않는다."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from packages.config.settings import env

CREDENTIAL_ENCRYPTION_KEY_ENV = "CREDENTIAL_ENCRYPTION_KEY"
TOKEN_PREFIX = "fernet:v1:"
DB_CREDENTIAL_REF_PREFIX = "db:"
AGENT_SEALED_PREFIX = "aesgcm:v1:"


class CredentialEncryptionError(RuntimeError):
    """자격증명 암호화 설정 또는 복호화 실패."""


def credential_ref(provider: str, scope: str) -> str:
    return f"db:{provider}:{scope}"


def parse_credential_ref(ref: str) -> tuple[str, str]:
    if not ref.startswith(DB_CREDENTIAL_REF_PREFIX):
        raise CredentialEncryptionError("unsupported credential_ref format")
    parts = ref.removeprefix(DB_CREDENTIAL_REF_PREFIX).split(":", 1)
    if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
        raise CredentialEncryptionError("credential_ref must be db:<provider>:<scope>")
    return parts[0].strip(), parts[1].strip()


def encrypt_credential(value: str) -> str:
    if not value:
        raise CredentialEncryptionError("저장할 자격증명이 비어 있습니다.")
    token = fernet().encrypt(value.encode("utf-8")).decode("ascii")
    return f"{TOKEN_PREFIX}{token}"


def decrypt_credential(value: str) -> str:
    if not value.startswith(TOKEN_PREFIX):
        raise CredentialEncryptionError("지원하지 않는 자격증명 암호문 형식입니다.")
    token = value.removeprefix(TOKEN_PREFIX).encode("ascii")
    try:
        return fernet().decrypt(token).decode("utf-8")
    except InvalidToken as exc:
        raise CredentialEncryptionError("자격증명 복호화에 실패했습니다.") from exc


def seal_agent_payload(payload: dict[str, Any], token: str, context: str) -> str:
    if not token or not context:
        raise CredentialEncryptionError("agent payload sealing identity is unavailable")
    nonce = os.urandom(12)
    plaintext = json.dumps(
        payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True
    ).encode()
    ciphertext = AESGCM(_agent_sealing_key(token, context)).encrypt(
        nonce,
        plaintext,
        context.encode(),
    )
    return AGENT_SEALED_PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def open_agent_payload(value: str, token: str, context: str) -> dict[str, Any]:
    if not value.startswith(AGENT_SEALED_PREFIX) or not token or not context:
        raise CredentialEncryptionError("agent payload envelope is unavailable")
    try:
        packed = base64.urlsafe_b64decode(value.removeprefix(AGENT_SEALED_PREFIX).encode("ascii"))
        plaintext = AESGCM(_agent_sealing_key(token, context)).decrypt(
            packed[:12],
            packed[12:],
            context.encode(),
        )
        payload = json.loads(plaintext)
    except Exception as exc:
        raise CredentialEncryptionError("agent payload envelope is invalid") from exc
    if not isinstance(payload, dict):
        raise CredentialEncryptionError("agent payload envelope is invalid")
    return payload


def _agent_sealing_key(token: str, context: str) -> bytes:
    return hashlib.sha256(f"opsia-agent-envelope-v1\0{context}\0{token}".encode()).digest()


def fernet() -> Fernet:
    configured = env(CREDENTIAL_ENCRYPTION_KEY_ENV, "").strip()
    if not configured:
        raise CredentialEncryptionError(
            f"{CREDENTIAL_ENCRYPTION_KEY_ENV}가 설정되지 않아 자격증명을 저장할 수 없습니다."
        )
    return Fernet(_fernet_key(configured))


def _fernet_key(value: str) -> bytes:
    try:
        decoded = base64.urlsafe_b64decode(value.encode("ascii"))
    except Exception:
        decoded = b""
    if len(decoded) == 32:
        return value.encode("ascii")
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)
