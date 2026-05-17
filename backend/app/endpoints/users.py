from pathlib import Path
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from postgrest.exceptions import APIError
from supabase import Client, StorageException
from typing import Any, Dict, List

from ..auth import get_current_user, invalidate_profile_cache, require_admin
from ..db import get_supabase
from ..postgrest_utils import is_missing_relation_error, is_missing_schema_field_error
from ..schemas import ProfileUpdate, RoleUpdate

router = APIRouter()
PROFILE_IMAGE_BUCKET = "profile-images"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}


def _default_full_name(user) -> str:
    metadata = getattr(user, "user_metadata", {}) or {}
    email = getattr(user, "email", None) or "protocol user"
    return metadata.get("full_name") or email.split("@")[0].replace(".", " ").title()


def _clean_optional_text(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _slugify_filename(value: str) -> str:
    stem = Path(value).stem or "image"
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", stem).strip("-").lower() or "image"


def _ensure_profile_image_bucket(supabase: Client) -> None:
    try:
        supabase.storage.get_bucket(PROFILE_IMAGE_BUCKET)
    except StorageException:
        try:
            supabase.storage.create_bucket(
                PROFILE_IMAGE_BUCKET,
                options={
                    "public": True,
                    "file_size_limit": MAX_IMAGE_BYTES,
                    "allowed_mime_types": list(ALLOWED_IMAGE_TYPES.keys()),
                },
            )
        except StorageException as exc:
            if "already exists" not in str(exc).lower():
                raise


def _ensure_profile(supabase: Client, user) -> Dict[str, Any]:
    res = supabase.table("profiles").select("*").eq("id", user.id).execute()
    if res.data:
        return res.data[0]

    metadata = getattr(user, "user_metadata", {}) or {}
    payload = {
        "id": user.id,
        "full_name": _default_full_name(user),
        "role": "protocol",
        "extension": metadata.get("extension"),
        "picture_url": metadata.get("picture_url"),
    }
    created = supabase.table("profiles").insert(payload).execute()
    if not created.data:
        raise HTTPException(status_code=500, detail="Failed to create profile")
    return created.data[0]


def _get_profile_or_404(supabase: Client, user_id: str) -> Dict[str, Any]:
    res = supabase.table("profiles").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]


def _fetch_map(supabase: Client, table: str, ids: List[str], columns: str = "*") -> Dict[str, Dict[str, Any]]:
    unique_ids = list({item for item in ids if item})
    if not unique_ids:
        return {}
    try:
        res = supabase.table(table).select(columns).in_("id", unique_ids).execute()
    except APIError as exc:
        if table == "sessions" and "time" in columns and is_missing_schema_field_error(exc, "sessions", "time"):
            fallback_columns = columns.replace(",time", "").replace("time,", "")
            res = supabase.table(table).select(fallback_columns).in_("id", unique_ids).execute()
        else:
            raise
    return {row["id"]: row for row in (res.data or [])}


def _enrich_user_assignments(supabase: Client, assignments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not assignments:
        return []

    conference_map = _fetch_map(supabase, "conferences", [row.get("conference_id") for row in assignments], "id,name,date,venue")
    roster_map = _fetch_map(
        supabase,
        "conference_dignitaries",
        [row.get("assigned_conference_dignitary_id") for row in assignments],
        "id,directory_dignitary_id,first_arrival_at,first_arrival_session_id",
    )
    dignitary_map = _fetch_map(
        supabase,
        "dignitary_directory",
        [row.get("directory_dignitary_id") for row in roster_map.values()],
        "id,name,title,church,extension,picture_url",
    )
    session_map = _fetch_map(
        supabase,
        "sessions",
        [row.get("first_arrival_session_id") for row in roster_map.values()],
        "id,name,date,time",
    )

    enriched = []
    for assignment in assignments:
        roster = roster_map.get(assignment.get("assigned_conference_dignitary_id"))
        enriched.append(
            {
                **assignment,
                "conference": conference_map.get(assignment.get("conference_id")),
                "assigned_dignitary": dignitary_map.get(roster.get("directory_dignitary_id")) if roster else None,
                "first_arrival_at": roster.get("first_arrival_at") if roster else None,
                "first_arrival_session": session_map.get(roster.get("first_arrival_session_id")) if roster else None,
            }
        )
    return enriched


def _get_user_assignments(supabase: Client, user_id: str) -> List[Dict[str, Any]]:
    try:
        res = (
            supabase.table("conference_protocol_assignments")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=False)
            .execute()
        )
        return _enrich_user_assignments(supabase, res.data or [])
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            return []
        raise


def _serialize_profile_response(profile: Dict[str, Any], assignments: List[Dict[str, Any]], email: str | None = None) -> Dict[str, Any]:
    payload = dict(profile)
    payload["conference_assignments"] = assignments
    payload["managed_conference_dignitary_ids"] = [
        assignment["assigned_conference_dignitary_id"]
        for assignment in assignments
        if assignment.get("assigned_conference_dignitary_id")
    ]
    if email:
        payload["email"] = email
    return payload


def _update_profile(supabase: Client, user_id: str, profile_update: ProfileUpdate) -> Dict[str, Any]:
    raw_data = profile_update.model_dump(exclude_unset=True)
    data = {key: _clean_optional_text(value) for key, value in raw_data.items()}
    if "full_name" in data and not data["full_name"]:
        raise HTTPException(status_code=400, detail="Full name cannot be empty.")
    if not data:
        return _get_profile_or_404(supabase, user_id)

    res = supabase.table("profiles").update(data).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]


def _clear_profile_references(supabase: Client, user_id: str) -> None:
    for table_name in (
        "conferences",
        "sessions",
        "dignitary_directory",
        "conference_dignitaries",
        "dignitaries",
        "conference_protocol_assignments",
    ):
        supabase.table(table_name).update({"created_by": None}).eq("created_by", user_id).execute()


def _delete_auth_user_if_supported(supabase: Client, user_id: str) -> bool:
    auth_client = getattr(supabase, "auth", None)
    admin_client = getattr(auth_client, "admin", None)
    delete_user = getattr(admin_client, "delete_user", None)
    if not callable(delete_user):
        return False

    delete_user(user_id)
    return True


async def _upload_profile_photo(supabase: Client, target_user_id: str, request: Request) -> Dict[str, str]:
    try:
        form = await request.form()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid multipart form data") from exc

    file = form.get("file")
    if file is None:
        raise HTTPException(status_code=400, detail="No file uploaded")

    content_type = getattr(file, "content_type", None)
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, or WEBP images are supported")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")
    if len(file_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller")

    _ensure_profile_image_bucket(supabase)

    extension = Path(file.filename or "").suffix.lower() or ALLOWED_IMAGE_TYPES[content_type]
    if extension not in ALLOWED_IMAGE_TYPES.values():
        extension = ALLOWED_IMAGE_TYPES[content_type]

    safe_name = _slugify_filename(file.filename or "profile")
    storage_path = f"profiles/{target_user_id}/{uuid4().hex}-{safe_name}{extension}"

    try:
        supabase.storage.from_(PROFILE_IMAGE_BUCKET).upload(
            storage_path,
            file_bytes,
            {"content-type": content_type, "x-upsert": "false"},
        )
    except StorageException as exc:
        raise HTTPException(status_code=400, detail=f"Image upload failed: {exc}") from exc

    picture_url = supabase.storage.from_(PROFILE_IMAGE_BUCKET).get_public_url(storage_path)
    return {"picture_url": picture_url, "storage_path": storage_path}


@router.get("/me", response_model=Dict[str, Any])
def get_current_user_profile(
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    profile = _ensure_profile(supabase, user)
    assignments = _get_user_assignments(supabase, user.id)
    return _serialize_profile_response(profile, assignments, getattr(user, "email", None))


@router.patch("/me/profile", response_model=Dict[str, Any])
def update_current_user_profile(
    profile_update: ProfileUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    _ensure_profile(supabase, user)
    profile = _update_profile(supabase, user.id, profile_update)
    invalidate_profile_cache(user.id)
    assignments = _get_user_assignments(supabase, user.id)
    return _serialize_profile_response(profile, assignments, getattr(user, "email", None))


@router.post("/me/upload-photo", response_model=Dict[str, str])
async def upload_current_user_photo(
    request: Request,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    _ensure_profile(supabase, user)
    return await _upload_profile_photo(supabase, user.id, request)


@router.get("/", response_model=List[Dict[str, Any]])
def get_all_users(
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    res = supabase.table("profiles").select("*").order("created_at", desc=False).execute()
    return res.data


@router.get("/{user_id}", response_model=Dict[str, Any])
def get_user_profile(
    user_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    profile = _get_profile_or_404(supabase, user_id)
    assignments = _get_user_assignments(supabase, user_id)
    return _serialize_profile_response(profile, assignments)


@router.patch("/{user_id}/profile", response_model=Dict[str, Any])
def update_user_profile(
    user_id: str,
    profile_update: ProfileUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    profile = _update_profile(supabase, user_id, profile_update)
    invalidate_profile_cache(user_id)
    assignments = _get_user_assignments(supabase, user_id)
    return _serialize_profile_response(profile, assignments)


@router.post("/{user_id}/upload-photo", response_model=Dict[str, str])
async def upload_user_photo(
    user_id: str,
    request: Request,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    _get_profile_or_404(supabase, user_id)
    return await _upload_profile_photo(supabase, user_id, request)


@router.patch("/{user_id}/role", response_model=Dict[str, Any])
def update_user_role(
    user_id: str,
    role_update: RoleUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot change their own role.",
        )

    res = supabase.table("profiles").update({"role": role_update.role}).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    invalidate_profile_cache(user_id)
    return res.data[0]


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protocol_user(
    user_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    if user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot delete their own account.",
        )

    profile = _get_profile_or_404(supabase, user_id)
    if profile.get("role") != "protocol":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only protocol users can be deleted from Manage Access.",
        )

    _clear_profile_references(supabase, user_id)
    supabase.table("conference_protocol_assignments").delete().eq("user_id", user_id).execute()

    auth_user_deleted = False
    try:
        auth_user_deleted = _delete_auth_user_if_supported(supabase, user_id)
    except Exception:
        auth_user_deleted = False

    if not auth_user_deleted:
        supabase.table("profiles").delete().eq("id", user_id).execute()

    invalidate_profile_cache(user_id)
    return None
