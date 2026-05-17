from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.postgrest_utils import (
    get_api_error_text,
    is_missing_relation_error,
    is_missing_schema_field_error,
    raise_postgrest_http_exception,
    strip_missing_field,
)


def make_api_error(code: str, message: str, details: str = "", hint: str = "") -> APIError:
    return APIError({"code": code, "message": message, "details": details, "hint": hint})


def test_get_api_error_text_joins_message_parts():
    error = make_api_error("PGRST205", "Missing relation", "profiles", "run migration")

    assert get_api_error_text(error) == "Missing relation profiles run migration"


def test_missing_relation_detection():
    error = make_api_error("PGRST205", "Could not find relation", "conference_protocol_assignments", "")

    assert is_missing_relation_error(error, "conference_protocol_assignments") is True
    assert is_missing_relation_error(error, "profiles") is False


def test_missing_schema_field_detection_and_strip():
    error = make_api_error("42703", "column does not exist", 'column "time" on relation "sessions"', "")
    payload = {"name": "Morning Session", "time": "10:00", "venue": "Main Hall"}

    assert is_missing_schema_field_error(error, "sessions", "time") is True
    assert strip_missing_field(payload, error, "sessions", "time") == {
        "name": "Morning Session",
        "venue": "Main Hall",
    }


def test_raise_postgrest_http_exception_uses_http_400_by_default():
    error = make_api_error("PGRST204", "schema cache missing", "", "")

    try:
      raise_postgrest_http_exception(error)
    except HTTPException as exc:
      assert exc.status_code == 400
      assert "schema cache missing" in exc.detail
    else:
      raise AssertionError("Expected HTTPException to be raised")


def test_raise_postgrest_http_exception_uses_http_503_for_migration_hint():
    error = make_api_error("PGRST204", "schema cache missing", "", "")

    try:
      raise_postgrest_http_exception(error, migration_detail="Migration required.")
    except HTTPException as exc:
      assert exc.status_code == 503
      assert "Migration required." in exc.detail
    else:
      raise AssertionError("Expected HTTPException to be raised")
