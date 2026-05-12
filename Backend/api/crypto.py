"""AES-256-GCM envelope encryption for vault secrets.

Requires VAULT_ENCRYPTION_KEY env var: 32-byte value as 64 hex chars.
Generate with:  openssl rand -hex 32
"""
from __future__ import annotations

import os
import secrets

_HEX_KEY = os.environ.get("VAULT_ENCRYPTION_KEY", "")


def _key() -> bytes:
    if not _HEX_KEY or len(_HEX_KEY) != 64:
        raise RuntimeError(
            "VAULT_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). "
            "Generate with: openssl rand -hex 32"
        )
    return bytes.fromhex(_HEX_KEY)


def encrypt(plaintext: str) -> tuple[bytes, bytes]:
    """Return (ciphertext, iv). iv is a random 12-byte nonce."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = secrets.token_bytes(12)
    ct = AESGCM(_key()).encrypt(iv, plaintext.encode(), None)
    return ct, iv


def decrypt(ciphertext: bytes, iv: bytes) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return AESGCM(_key()).decrypt(iv, ciphertext, None).decode()


def encryption_enabled() -> bool:
    return bool(_HEX_KEY) and len(_HEX_KEY) == 64
