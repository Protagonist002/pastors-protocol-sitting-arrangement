from fastapi import HTTPException

from app.endpoints.users import (
    _clean_optional_text,
    _normalize_registration_payload,
    _serialize_profile_response,
    _slugify_filename,
)
from app.schemas import RegisterUserCreate


def test_clean_optional_text_trims_and_nulls_blank_strings():
    assert _clean_optional_text("  GLT  ") == "GLT"
    assert _clean_optional_text("   ") is None
    assert _clean_optional_text(42) == 42


def test_slugify_filename_normalizes_profile_images():
    assert _slugify_filename("My Profile Photo!.png") == "my-profile-photo"
    assert _slugify_filename("....") == "image"


def test_serialize_profile_response_adds_assignments_and_managed_ids():
    profile = {"id": "user-1", "full_name": "Henry"}
    assignments = [
        {"assigned_conference_dignitary_id": "d-1"},
        {"assigned_conference_dignitary_id": None},
        {"assigned_conference_dignitary_id": "d-2"},
    ]

    payload = _serialize_profile_response(profile, assignments, "henry@example.com")

    assert payload["conference_assignments"] == assignments
    assert payload["managed_conference_dignitary_ids"] == ["d-1", "d-2"]
    assert payload["email"] == "henry@example.com"


def test_normalize_registration_payload_trims_values():
    payload = RegisterUserCreate(
        email="  Officer@Church.org ",
        password="secret123",
        full_name="  Protocol Officer  ",
        extension="  Accra Central  ",
    )

    normalized = _normalize_registration_payload(payload)

    assert normalized == {
        "email": "officer@church.org",
        "password": "secret123",
        "full_name": "Protocol Officer",
        "extension": "Accra Central",
    }


def test_normalize_registration_payload_rejects_short_password():
    payload = RegisterUserCreate(
        email="officer@church.org",
        password="123",
        full_name="Protocol Officer",
        extension="Accra Central",
    )

    try:
        _normalize_registration_payload(payload)
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "Password" in exc.detail
    else:
        raise AssertionError("Expected HTTPException")
