import pytest

from app.core.exceptions import UnauthorizedError
from app.core.security import (
    build_password_token_fingerprint,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_verification_accepts_only_original_password() -> None:
    password_hash = hash_password("strong-password")

    assert password_hash != "strong-password"
    assert verify_password("strong-password", password_hash) is True
    assert verify_password("wrong-password", password_hash) is False


def test_access_token_roundtrip_contains_subject_role_and_password_fingerprint() -> None:
    password_hash = "stored-password-hash"
    token = create_access_token("user@example.com", "student", password_hash)

    payload = decode_access_token(token)

    assert payload["sub"] == "user@example.com"
    assert payload["role"] == "student"
    assert payload["pwdv"] == build_password_token_fingerprint(password_hash)


def test_decode_access_token_rejects_invalid_token() -> None:
    with pytest.raises(UnauthorizedError):
        decode_access_token("not-a-valid-token")
