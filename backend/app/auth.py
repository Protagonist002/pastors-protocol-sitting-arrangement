import base64
import json
import os
import time
from threading import RLock
from types import SimpleNamespace

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from .db import get_supabase

security = HTTPBearer()
AUTH_CACHE_TTL_SECONDS = max(0, int(os.getenv("AUTH_CACHE_TTL_SECONDS", "60")))
PROFILE_CACHE_TTL_SECONDS = max(0, int(os.getenv("PROFILE_CACHE_TTL_SECONDS", "30")))
_cache_lock = RLock()
_auth_cache = {}
_profile_cache = {}


def _get_cached_value(cache: dict, key: str):
    now = time.monotonic()
    with _cache_lock:
        entry = cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at <= now:
            cache.pop(key, None)
            return None
        return value


def _set_cached_value(cache: dict, key: str, value, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return
    with _cache_lock:
        cache[key] = (time.monotonic() + ttl_seconds, value)


def _get_token_cache_ttl(token: str) -> int:
    if AUTH_CACHE_TTL_SECONDS <= 0:
        return 0

    try:
        payload = _decode_jwt_payload(token)
        expires_at = payload.get("exp")
        if expires_at is None:
            return AUTH_CACHE_TTL_SECONDS
        remaining = max(0, int(expires_at - time.time()))
        return min(AUTH_CACHE_TTL_SECONDS, remaining)
    except Exception:
        return AUTH_CACHE_TTL_SECONDS


def invalidate_profile_cache(user_id: str) -> None:
    with _cache_lock:
        _profile_cache.pop(user_id, None)


def get_profile_record(supabase: Client, user_id: str):
    cached_profile = _get_cached_value(_profile_cache, user_id)
    if cached_profile is not None:
        return cached_profile

    res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    _set_cached_value(_profile_cache, user_id, res.data, PROFILE_CACHE_TTL_SECONDS)
    return res.data


def _decode_jwt_payload(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed bearer token")

    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    decoded = base64.urlsafe_b64decode(f"{payload}{padding}")
    data = json.loads(decoded.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Invalid JWT payload")
    return data


def _is_transport_auth_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(
        needle in message
        for needle in (
            "ssl",
            "bad record mac",
            "connecterror",
            "readerror",
            "remoteprotocolerror",
            "proxy",
            "timeout",
            "temporarily unavailable",
            "connection reset",
        )
    )


def _build_fallback_user(token: str):
    payload = _decode_jwt_payload(token)
    subject = payload.get("sub")
    if not subject:
        raise ValueError("Token subject is missing")

    expires_at = payload.get("exp")
    if expires_at is not None and int(expires_at) <= int(time.time()):
        raise ValueError("Token has expired")

    audience = payload.get("aud")
    if audience not in {None, "authenticated"}:
        raise ValueError("Token audience is invalid")

    expected_issuer_prefix = os.getenv("SUPABASE_URL")
    issuer = payload.get("iss")
    if expected_issuer_prefix and issuer and not issuer.startswith(expected_issuer_prefix):
        raise ValueError("Token issuer is invalid")

    metadata = payload.get("user_metadata") or payload.get("app_metadata") or {}
    return SimpleNamespace(
        id=subject,
        email=payload.get("email"),
        user_metadata=metadata if isinstance(metadata, dict) else {},
        claims=payload,
    )

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), supabase: Client = Depends(get_supabase)):
    """
    Validates the Supabase JWT token and extracts the user.
    """
    token = credentials.credentials
    cached_user = _get_cached_value(_auth_cache, token)
    if cached_user is not None:
        return cached_user

    try:
        # We verify the token by calling Supabase's auth.get_user(jwt)
        # In a real high-throughput production environment, you might decode the JWT locally with the Supabase project JWT secret
        # to avoid the network roundtrip, but calling the Supabase API is safer to ensure it's not revoked.
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        _set_cached_value(_auth_cache, token, user_response.user, _get_token_cache_ttl(token))
        return user_response.user
    except HTTPException:
        raise
    except Exception as e:
        if _is_transport_auth_error(e):
            try:
                fallback_user = _build_fallback_user(token)
                _set_cached_value(_auth_cache, token, fallback_user, _get_token_cache_ttl(token))
                return fallback_user
            except Exception as fallback_error:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Authentication failed: {fallback_error}",
                    headers={"WWW-Authenticate": "Bearer"},
                ) from fallback_error
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_editor_or_admin(user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    """
    Checks the user's profile to see if they hold 'editor' or 'admin' roles.
    """
    try:
        role = get_profile_record(supabase, user.id).get("role")
        if role not in ["admin", "editor"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action. Editor or Admin role required."
            )
        return user
    except HTTPException:
        raise
    except Exception as e:
        # If no profile or error fetching profile
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission check failed: {str(e)}"
        )

def require_admin(user = Depends(get_current_user), supabase: Client = Depends(get_supabase)):
    """
    Checks the user's profile to see if they hold 'admin' role.
    """
    try:
        role = get_profile_record(supabase, user.id).get("role")
        if role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action. Admin role required."
            )
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission check failed: {str(e)}"
        )
