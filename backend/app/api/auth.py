"""Cookie sessions, refresh-token rotation, CSRF protection, and optional TOTP MFA."""

import base64
import hashlib
import hmac
import secrets
import time
import uuid
from datetime import datetime, timedelta
from urllib.parse import quote, urlparse

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core import security
from app.core.config import settings
from app.db.database import get_db
from app.models.domain import User, UserSession

router = APIRouter()

ACCESS_COOKIE = "fs_access"
REFRESH_COOKIE = "fs_refresh"
CSRF_COOKIE = "fs_csrf"
CSRF_HEADER = "X-CSRF-Token"
REFRESH_TOKEN_BYTES = 48


class MfaChallenge(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=32)


class MfaPasswordRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class MfaDisableRequest(MfaPasswordRequest):
    code: str = Field(min_length=6, max_length=32)


def _now() -> datetime:
    return datetime.utcnow()


def _is_production() -> bool:
    return settings.ENVIRONMENT.strip().lower() in {"production", "prod"}


def _ensure_trusted_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin:
        return
    parsed = urlparse(origin)
    candidate = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}" if parsed.scheme and parsed.netloc else ""
    allowed = {
        f"{urlparse(value.strip()).scheme.lower()}://{urlparse(value.strip()).netloc.lower()}"
        for value in settings.BACKEND_CORS_ORIGINS.split(",")
        if value.strip()
    }
    if not candidate or candidate not in allowed:
        raise HTTPException(status_code=403, detail="Untrusted request origin")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _account_locked(user: User, now: datetime = None) -> bool:
    return bool(user.auth_locked_until and user.auth_locked_until > (now or _now()))


def _record_failed_auth(db: Session, user: User) -> None:
    now = _now()
    if user.auth_locked_until and user.auth_locked_until <= now:
        user.auth_failed_attempts = 0
        user.auth_locked_until = None
    user.auth_failed_attempts = (user.auth_failed_attempts or 0) + 1
    if user.auth_failed_attempts >= 10:
        user.auth_locked_until = now + timedelta(minutes=15)
    db.commit()


def _mfa_locked(user: User, now: datetime = None) -> bool:
    return bool(user.mfa_locked_until and user.mfa_locked_until > (now or _now()))


def _record_failed_mfa(db: Session, user: User) -> None:
    now = _now()
    if user.mfa_locked_until and user.mfa_locked_until <= now:
        user.mfa_failed_attempts = 0
        user.mfa_locked_until = None
    user.mfa_failed_attempts = (user.mfa_failed_attempts or 0) + 1
    if user.mfa_failed_attempts >= 10:
        user.mfa_locked_until = now + timedelta(minutes=15)
    db.commit()


def _set_session_cookies(response: Response, access: str, refresh: str, csrf: str) -> None:
    secure = _is_production()
    access_seconds = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_seconds = settings.SESSION_REFRESH_EXPIRE_DAYS * 86400
    response.set_cookie(ACCESS_COOKIE, access, max_age=access_seconds, httponly=True, secure=secure, samesite="lax", path="/")
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=refresh_seconds, httponly=True, secure=secure, samesite="lax", path="/api/auth")
    response.set_cookie(CSRF_COOKIE, csrf, max_age=refresh_seconds, httponly=False, secure=secure, samesite="lax", path="/")


def _clear_session_cookies(response: Response) -> None:
    secure = _is_production()
    response.delete_cookie(ACCESS_COOKIE, path="/", secure=secure, httponly=True, samesite="lax")
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", secure=secure, httponly=True, samesite="lax")
    response.delete_cookie(CSRF_COOKIE, path="/", secure=secure, httponly=False, samesite="lax")


def _issue_session(db: Session, user: User, request: Request, response: Response) -> dict:
    session_id = str(uuid.uuid4())
    refresh = secrets.token_urlsafe(REFRESH_TOKEN_BYTES)
    csrf = secrets.token_urlsafe(32)
    now = _now()
    expires = now + timedelta(days=settings.SESSION_REFRESH_EXPIRE_DAYS)
    row = UserSession(
        session_identifier=session_id,
        user_id=user.id,
        refresh_token_hash=_hash_token(refresh),
        csrf_token_hash=_hash_token(csrf),
        created_at=now,
        last_used_at=now,
        expires_at=expires,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
    )
    db.add(row)
    db.commit()
    access = security.create_access_token(
        user.username,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        extra_claims={"sid": session_id},
    )
    _set_session_cookies(response, access, refresh, csrf)
    return {"authenticated": True, "username": user.username, "role": user.role, "mfa_enabled": user.totp_enabled}


def _encryption_box() -> Fernet:
    key_material = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key_material))


def _encrypt_secret(secret: str) -> str:
    return _encryption_box().encrypt(secret.encode("ascii")).decode("ascii")


def _decrypt_secret(encrypted: str) -> str:
    try:
        return _encryption_box().decrypt(encrypted.encode("ascii")).decode("ascii")
    except (InvalidToken, ValueError, UnicodeError) as exc:
        raise HTTPException(status_code=500, detail="MFA secret cannot be decrypted; review the configured SECRET_KEY") from exc


def _new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _totp_step(secret: str, code: str, now_seconds: int = None) -> int | None:
    normalized = "".join(char for char in code if char.isdigit())
    if len(normalized) != 6:
        return None
    try:
        padded = secret.upper() + ("=" * ((8 - len(secret) % 8) % 8))
        key = base64.b32decode(padded, casefold=True)
    except Exception:
        return None
    current = (now_seconds if now_seconds is not None else int(time.time())) // 30
    for step in (current, current - 1, current + 1):
        digest = hmac.new(key, step.to_bytes(8, "big"), hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        binary = int.from_bytes(digest[offset:offset + 4], "big") & 0x7FFFFFFF
        expected = f"{binary % 1_000_000:06d}"
        if hmac.compare_digest(expected, normalized):
            return step
    return None


def _consume_mfa_code(db: Session, user: User, code: str, secret: str = None) -> bool:
    if secret is None:
        if not user.totp_enabled or not user.totp_secret_encrypted:
            return False
        secret = _decrypt_secret(user.totp_secret_encrypted)
    step = _totp_step(secret, code)
    if step is not None and step > user.totp_last_step:
        user.totp_last_step = step
        db.flush()
        return True

    normalized = code.strip().upper().replace("-", "")
    candidate_hash = _hash_token(normalized)
    stored = list(user.totp_recovery_hashes or [])
    match = next((value for value in stored if hmac.compare_digest(value, candidate_hash)), None)
    if match:
        user.totp_recovery_hashes = [value for value in stored if value != match]
        db.flush()
        return True
    return False


def _make_mfa_challenge(user: User) -> str:
    now = datetime.utcnow()
    return jwt.encode(
        {"sub": user.username, "purpose": "mfa_challenge", "exp": now + timedelta(minutes=5), "jti": secrets.token_urlsafe(16)},
        settings.SECRET_KEY,
        algorithm="HS256",
    )


@router.post("/login")
def login_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    _ensure_trusted_origin(request)
    user_query = db.query(User).filter(User.username == form_data.username)
    if db.get_bind().dialect.name == "postgresql":
        user_query = user_query.with_for_update()
    user = user_query.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    if _account_locked(user) or not security.verify_password(form_data.password, user.hashed_password):
        if not _account_locked(user):
            _record_failed_auth(db, user)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    user.auth_failed_attempts = 0
    user.auth_locked_until = None
    db.commit()
    if user.totp_enabled:
        return {"requires_mfa": True, "challenge_token": _make_mfa_challenge(user)}
    return _issue_session(db, user, request, response)


@router.post("/mfa/verify")
def verify_mfa_challenge(
    payload: MfaChallenge,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    _ensure_trusted_origin(request)
    try:
        claims = jwt.decode(payload.challenge_token, settings.SECRET_KEY, algorithms=["HS256"])
        if claims.get("purpose") != "mfa_challenge" or not claims.get("sub"):
            raise ValueError("invalid challenge")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="MFA challenge expired; sign in again")
    query = db.query(User).filter(User.username == claims["sub"])
    if db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update()
    user = query.first()
    if not user or not user.totp_enabled:
        db.rollback()
        raise HTTPException(status_code=401, detail="Invalid or already-used MFA code")
    if _mfa_locked(user):
        raise HTTPException(status_code=401, detail="Invalid or already-used MFA code")
    if not _consume_mfa_code(db, user, payload.code):
        _record_failed_mfa(db, user)
        raise HTTPException(status_code=401, detail="Invalid or already-used MFA code")
    user.mfa_failed_attempts = 0
    user.mfa_locked_until = None
    db.commit()
    return _issue_session(db, user, request, response)


@router.get("/session")
def current_session(current_user: User = Depends(get_current_user)):
    return {
        "authenticated": True,
        "username": current_user.username,
        "role": current_user.role,
        "mfa_enabled": current_user.totp_enabled,
    }


@router.post("/refresh")
def refresh_session(request: Request, response: Response, db: Session = Depends(get_db)):
    _ensure_trusted_origin(request)
    refresh = request.cookies.get(REFRESH_COOKIE, "")
    csrf_cookie = request.cookies.get(CSRF_COOKIE, "")
    csrf_header = request.headers.get(CSRF_HEADER, "")
    if not refresh or not csrf_cookie or not hmac.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=401, detail="Refresh session is missing or invalid")

    refresh_hash = _hash_token(refresh)
    query = db.query(UserSession).filter(UserSession.refresh_token_hash == refresh_hash)
    if db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update()
    session = query.first()
    if session is None:
        reused = db.query(UserSession).filter(UserSession.previous_refresh_token_hash == refresh_hash).first()
        if reused and reused.revoked_at is None:
            reused.revoked_at = _now()
            db.commit()
        raise HTTPException(status_code=401, detail="Refresh token expired or already rotated")

    now = _now()
    if session.revoked_at or session.expires_at <= now:
        raise HTTPException(status_code=401, detail="Session expired or revoked")
    if not hmac.compare_digest(session.csrf_token_hash, _hash_token(csrf_cookie)):
        raise HTTPException(status_code=403, detail="CSRF token validation failed")
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        session.revoked_at = now
        db.commit()
        raise HTTPException(status_code=401, detail="Session owner is unavailable")

    new_refresh = secrets.token_urlsafe(REFRESH_TOKEN_BYTES)
    new_csrf = secrets.token_urlsafe(32)
    session.previous_refresh_token_hash = session.refresh_token_hash
    session.refresh_token_hash = _hash_token(new_refresh)
    session.csrf_token_hash = _hash_token(new_csrf)
    session.last_used_at = now
    db.commit()
    access = security.create_access_token(
        user.username,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        extra_claims={"sid": session.session_identifier},
    )
    remaining = max(1, int((session.expires_at - now).total_seconds()))
    secure = _is_production()
    response.set_cookie(ACCESS_COOKIE, access, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, httponly=True, secure=secure, samesite="lax", path="/")
    response.set_cookie(REFRESH_COOKIE, new_refresh, max_age=remaining, httponly=True, secure=secure, samesite="lax", path="/api/auth")
    response.set_cookie(CSRF_COOKIE, new_csrf, max_age=remaining, httponly=False, secure=secure, samesite="lax", path="/")
    return {"authenticated": True}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    _ensure_trusted_origin(request)
    refresh = request.cookies.get(REFRESH_COOKIE, "")
    csrf_cookie = request.cookies.get(CSRF_COOKIE, "")
    csrf_header = request.headers.get(CSRF_HEADER, "")
    if refresh and csrf_cookie and hmac.compare_digest(csrf_cookie, csrf_header):
        session = db.query(UserSession).filter(UserSession.refresh_token_hash == _hash_token(refresh)).first()
        if session and hmac.compare_digest(session.csrf_token_hash, _hash_token(csrf_cookie)) and not session.revoked_at:
            session.revoked_at = _now()
            db.commit()
    _clear_session_cookies(response)
    response.status_code = 204
    return response


@router.get("/sessions")
def list_sessions(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    access = request.cookies.get(ACCESS_COOKIE, "")
    claims = {}
    if access:
        try:
            claims = jwt.decode(access, settings.SECRET_KEY, algorithms=["HS256"])
        except JWTError:
            pass
    rows = db.query(UserSession).filter(UserSession.user_id == current_user.id, UserSession.revoked_at.is_(None), UserSession.expires_at > _now()).order_by(UserSession.created_at.desc()).all()
    return [{"session_identifier": row.session_identifier, "created_at": row.created_at, "last_used_at": row.last_used_at, "expires_at": row.expires_at, "user_agent": row.user_agent, "current": row.session_identifier == claims.get("sid")} for row in rows]


@router.delete("/sessions/{session_identifier}", status_code=204)
def revoke_session(session_identifier: str, response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(UserSession).filter(UserSession.session_identifier == session_identifier, UserSession.user_id == current_user.id).first()
    if row and not row.revoked_at:
        row.revoked_at = _now()
        db.commit()
    response.status_code = 204
    return response


@router.post("/mfa/setup")
def setup_mfa(payload: MfaPasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if _mfa_locked(current_user):
        raise HTTPException(status_code=429, detail="Security verification is temporarily locked")
    if not security.verify_password(payload.password, current_user.hashed_password):
        _record_failed_mfa(db, current_user)
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if current_user.totp_enabled:
        raise HTTPException(status_code=409, detail="MFA is already enabled")
    secret = _new_totp_secret()
    current_user.totp_pending_secret_encrypted = _encrypt_secret(secret)
    current_user.totp_pending_expires_at = _now() + timedelta(minutes=10)
    current_user.mfa_failed_attempts = 0
    current_user.mfa_locked_until = None
    db.commit()
    account = quote(current_user.username, safe="")
    issuer = quote(settings.PROJECT_NAME, safe="")
    uri = f"otpauth://totp/{issuer}:{account}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"
    return {"secret": secret, "otpauth_uri": uri, "expires_in_minutes": 10}


@router.post("/mfa/enable")
def enable_mfa(payload: MfaCodeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if _mfa_locked(current_user):
        raise HTTPException(status_code=429, detail="Security verification is temporarily locked")
    if not current_user.totp_pending_secret_encrypted or not current_user.totp_pending_expires_at or current_user.totp_pending_expires_at <= _now():
        current_user.totp_pending_secret_encrypted = None
        current_user.totp_pending_expires_at = None
        db.commit()
        raise HTTPException(status_code=409, detail="Start MFA setup before enabling it")
    secret = _decrypt_secret(current_user.totp_pending_secret_encrypted)
    step = _totp_step(secret, payload.code)
    if step is None or step <= current_user.totp_last_step:
        _record_failed_mfa(db, current_user)
        raise HTTPException(status_code=400, detail="Authenticator code is invalid or already used")
    recovery_codes = [secrets.token_hex(16).upper() for _ in range(10)]
    current_user.totp_enabled = True
    current_user.totp_secret_encrypted = current_user.totp_pending_secret_encrypted
    current_user.totp_pending_secret_encrypted = None
    current_user.totp_pending_expires_at = None
    current_user.totp_last_step = step
    current_user.totp_recovery_hashes = [_hash_token(code) for code in recovery_codes]
    current_user.mfa_failed_attempts = 0
    current_user.mfa_locked_until = None
    db.commit()
    return {"mfa_enabled": True, "recovery_codes": recovery_codes, "warning": "Save these recovery codes now. They are shown only once."}


@router.post("/mfa/disable")
def disable_mfa(payload: MfaDisableRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if _mfa_locked(current_user):
        raise HTTPException(status_code=429, detail="Security verification is temporarily locked")
    if not security.verify_password(payload.password, current_user.hashed_password):
        _record_failed_mfa(db, current_user)
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if not current_user.totp_enabled:
        raise HTTPException(status_code=409, detail="MFA is not enabled")
    if not _consume_mfa_code(db, current_user, payload.code):
        _record_failed_mfa(db, current_user)
        raise HTTPException(status_code=400, detail="Authenticator or recovery code is invalid")
    current_user.totp_enabled = False
    current_user.totp_secret_encrypted = None
    current_user.totp_pending_secret_encrypted = None
    current_user.totp_pending_expires_at = None
    current_user.totp_recovery_hashes = []
    current_user.totp_last_step = -1
    current_user.mfa_failed_attempts = 0
    current_user.mfa_locked_until = None
    db.commit()
    return {"mfa_enabled": False}
