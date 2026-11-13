from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Union, Tuple, List
from jose import jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEFAULT_ALGORITHM = "HS256"

def get_signing_algorithm_and_key() -> Tuple[str, str]:
    """Returns the algorithm and signing key (asymmetric RS256 if configured, otherwise HS256)."""
    jwt_private_key = getattr(settings, "JWT_PRIVATE_KEY", None)
    if jwt_private_key and jwt_private_key.strip():
        return "RS256", jwt_private_key.strip()
    return DEFAULT_ALGORITHM, settings.SECRET_KEY

def get_verification_algorithm_and_key() -> Tuple[List[str], str]:
    """Returns accepted verification algorithms and key (public key for RS256, secret for HS256)."""
    jwt_public_key = getattr(settings, "JWT_PUBLIC_KEY", None)
    if jwt_public_key and jwt_public_key.strip():
        return ["RS256"], jwt_public_key.strip()
    return [DEFAULT_ALGORITHM], settings.SECRET_KEY

def create_access_token(
    subject: Union[str, Any], expires_delta: timedelta = None, extra_claims: Dict[str, Any] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    if extra_claims:
        to_encode.update(extra_claims)
    algo, key = get_signing_algorithm_and_key()
    encoded_jwt = jwt.encode(to_encode, key, algorithm=algo)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    """Decodes and validates an access token using configured cryptographic keys."""
    algos, key = get_verification_algorithm_and_key()
    return jwt.decode(token, key, algorithms=algos)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
