from fastapi import HTTPException
from postgrest.exceptions import APIError


def get_api_error_parts(error: Exception):
    if not isinstance(error, APIError):
        return None, str(error), "", ""

    payload = getattr(error, "message", None)
    if isinstance(payload, dict):
        code = payload.get("code")
        message = str(payload.get("message", "") or str(error))
        details = str(payload.get("details", "") or "")
        hint = str(payload.get("hint", "") or "")
        return code, message, details, hint

    code = getattr(error, "code", None)
    message = str(payload or str(error))
    details = str(getattr(error, "details", "") or "")
    hint = str(getattr(error, "hint", "") or "")
    return code, message, details, hint


def get_api_error_text(error: Exception) -> str:
    _, message, details, hint = get_api_error_parts(error)
    parts = [part.strip() for part in (message, details, hint) if part and part.strip()]
    return " ".join(parts) or str(error)


def is_missing_relation_error(error: Exception, relation_name: str) -> bool:
    if not isinstance(error, APIError):
        return False

    code, message, details, hint = get_api_error_parts(error)
    haystack = " ".join((message, details, hint))
    return code == "PGRST205" and relation_name in haystack


def is_missing_schema_field_error(error: Exception, relation_name: str, field_name: str) -> bool:
    if not isinstance(error, APIError):
        return False

    code, message, details, hint = get_api_error_parts(error)
    haystack = " ".join((message, details, hint)).lower()
    return (
        relation_name.lower() in haystack
        and field_name.lower() in haystack
        and (
            code in {"PGRST204", "PGRST205", "42703"}
            or "schema cache" in haystack
            or "column" in haystack
            or "could not find" in haystack
            or "does not exist" in haystack
        )
    )


def strip_missing_field(data: dict, error: Exception, relation_name: str, field_name: str) -> dict | None:
    if field_name not in data or not is_missing_schema_field_error(error, relation_name, field_name):
        return None

    next_data = dict(data)
    next_data.pop(field_name, None)
    return next_data


def raise_postgrest_http_exception(error: Exception, migration_detail: str | None = None) -> None:
    if not isinstance(error, APIError):
        raise error

    detail = get_api_error_text(error)
    if migration_detail:
        detail = f"{migration_detail} Database said: {detail}"
        raise HTTPException(status_code=503, detail=detail)

    raise HTTPException(status_code=400, detail=detail)
