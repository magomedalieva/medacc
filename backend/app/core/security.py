import hashlib
import hmac
from datetime import timedelta

from fastapi import Response
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import UnauthorizedError
from app.core.clock import utc_now


password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_context.verify(password, password_hash)


def build_password_token_fingerprint(password_hash: str) -> str:
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        password_hash.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def create_access_token(subject: str, role: str, password_hash: str) -> str:
    expires_at = utc_now() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": subject,
        "role": role,
        "pwdv": build_password_token_fingerprint(password_hash),
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, object]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exception:
        raise UnauthorizedError("Некорректный токен доступа") from exception
    return payload


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path="/",
    )
