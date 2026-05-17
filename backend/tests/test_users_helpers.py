from app.endpoints.users import _clean_optional_text, _serialize_profile_response, _slugify_filename


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
