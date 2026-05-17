import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from postgrest.exceptions import APIError
from supabase import Client, StorageException
from typing import Any, Dict, List

from ..auth import get_current_user, require_admin, require_editor_or_admin
from ..db import get_supabase
from ..postgrest_utils import is_missing_relation_error, is_missing_schema_field_error
from ..schemas import (
    ConferenceDignitaryCreate,
    DignitaryCreate,
    DignitaryStatusUpdate,
    DignitaryUpdate,
    DirectoryDignitaryCreate,
    DirectoryDignitaryUpdate,
)

nested_router = APIRouter()
conference_router = APIRouter()
direct_router = APIRouter()
directory_router = APIRouter()

CONFERENCE_ROSTER_SELECT = "*, dignitary:dignitary_directory(*)"
DIGNITARY_IMAGE_BUCKET = "dignitary-images"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}
ARRIVAL_STATUSES = {"arrived"}


def _fetch_profile_map(supabase: Client, user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not user_ids:
        return {}
    res = supabase.table("profiles").select("*").in_("id", list(set(user_ids))).execute()
    return {row["id"]: row for row in (res.data or [])}


def _fetch_session_map(supabase: Client, session_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not session_ids:
        return {}
    try:
        res = supabase.table("sessions").select("id,name,date,time").in_("id", list(set(session_ids))).execute()
    except APIError as exc:
        if is_missing_schema_field_error(exc, "sessions", "time"):
            res = supabase.table("sessions").select("id,name,date").in_("id", list(set(session_ids))).execute()
        else:
            raise
    return {row["id"]: row for row in (res.data or [])}


def _fetch_assignment_map(supabase: Client, conf_id: str) -> Dict[str, Dict[str, Any]]:
    try:
        res = (
            supabase.table("conference_protocol_assignments")
            .select("*")
            .eq("conference_id", conf_id)
            .execute()
        )
        return {
            row["assigned_conference_dignitary_id"]: row
            for row in (res.data or [])
            if row.get("assigned_conference_dignitary_id")
        }
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            return {}
        raise


def _flatten_roster_entry(
    row: Dict[str, Any],
    assignment_map: Dict[str, Dict[str, Any]],
    profile_map: Dict[str, Dict[str, Any]],
    session_map: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    dignitary = row.get("dignitary") or {}
    assignment = assignment_map.get(row.get("id"))
    assigned_profile = profile_map.get(assignment.get("user_id")) if assignment else None
    first_arrival_session = session_map.get(row.get("first_arrival_session_id"))
    return {
        "id": row.get("id"),
        "conference_id": row.get("conference_id"),
        "directory_dignitary_id": row.get("directory_dignitary_id"),
        "created_at": row.get("created_at"),
        "first_arrival_at": row.get("first_arrival_at"),
        "first_arrival_session_id": row.get("first_arrival_session_id"),
        "first_arrival_session": first_arrival_session,
        "assigned_protocol_user_id": assignment.get("user_id") if assignment else None,
        "assigned_protocol_name": assigned_profile.get("full_name") if assigned_profile else None,
        "assigned_protocol_profile": assigned_profile,
        "conference_role": assignment.get("conference_role") if assignment else None,
        **dignitary,
    }


def _get_session_record(session_id: str, supabase: Client) -> Dict[str, Any]:
    res = supabase.table("sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


def _get_directory_dignitary(directory_dignitary_id: str, supabase: Client) -> Dict[str, Any]:
    res = supabase.table("dignitary_directory").select("*").eq("id", directory_dignitary_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Directory dignitary not found")
    return res.data[0]


def _get_roster_entry(conference_dignitary_id: str, supabase: Client) -> Dict[str, Any]:
    res = (
        supabase.table("conference_dignitaries")
        .select(CONFERENCE_ROSTER_SELECT)
        .eq("id", conference_dignitary_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Conference dignitary not found")
    return res.data[0]


def _get_dignitary_or_404(dignitary_id: str, supabase: Client) -> Dict[str, Any]:
    res = supabase.table("dignitaries").select("*").eq("id", dignitary_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Dignitary not found")
    return res.data[0]


def _slugify_filename(filename: str) -> str:
    stem = Path(filename).stem or "image"
    return re.sub(r"[^a-zA-Z0-9_-]+", "-", stem).strip("-").lower() or "image"


def _ensure_dignitary_image_bucket(supabase: Client) -> None:
    try:
        supabase.storage.get_bucket(DIGNITARY_IMAGE_BUCKET)
    except StorageException:
        try:
            supabase.storage.create_bucket(
                DIGNITARY_IMAGE_BUCKET,
                options={
                    "public": True,
                    "file_size_limit": MAX_IMAGE_BYTES,
                    "allowed_mime_types": list(ALLOWED_IMAGE_TYPES.keys()),
                },
            )
        except StorageException as exc:
            if "already exists" not in str(exc).lower():
                raise


def _record_first_arrival_if_needed(
    supabase: Client,
    conference_dignitary_id: str | None,
    session_id: str,
    next_status: str,
) -> None:
    if not conference_dignitary_id or next_status not in ARRIVAL_STATUSES:
        return

    roster = (
        supabase.table("conference_dignitaries")
        .select("id,first_arrival_at")
        .eq("id", conference_dignitary_id)
        .execute()
    )
    if not roster.data or roster.data[0].get("first_arrival_at"):
        return

    (
        supabase.table("conference_dignitaries")
        .update(
            {
                "first_arrival_at": "now()",
                "first_arrival_session_id": session_id,
            }
        )
        .eq("id", conference_dignitary_id)
        .execute()
    )


def _can_manage_status(supabase: Client, user_id: str, dignitary: Dict[str, Any]) -> bool:
    profile = get_profile_record(supabase, user_id)
    if profile.get("role") == "admin":
        return True

    conference_dignitary_id = dignitary.get("conference_dignitary_id")
    if not conference_dignitary_id:
        return False

    session = _get_session_record(dignitary["session_id"], supabase)
    try:
        assignment = (
            supabase.table("conference_protocol_assignments")
            .select("id")
            .eq("conference_id", session["conference_id"])
            .eq("user_id", user_id)
            .eq("assigned_conference_dignitary_id", conference_dignitary_id)
            .execute()
        )
        return bool(assignment.data)
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            return False
        raise


@conference_router.get("/{conf_id}/dignitaries", response_model=List[Dict[str, Any]])
def get_conference_dignitaries(
    conf_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    res = (
        supabase.table("conference_dignitaries")
        .select(CONFERENCE_ROSTER_SELECT)
        .eq("conference_id", conf_id)
        .order("created_at", desc=False)
        .execute()
    )
    rows = res.data or []
    assignment_map = _fetch_assignment_map(supabase, conf_id)
    profile_map = _fetch_profile_map(
        supabase,
        [assignment["user_id"] for assignment in assignment_map.values() if assignment.get("user_id")],
    )
    session_map = _fetch_session_map(
        supabase,
        [row["first_arrival_session_id"] for row in rows if row.get("first_arrival_session_id")],
    )
    return [_flatten_roster_entry(row, assignment_map, profile_map, session_map) for row in rows]


@conference_router.post("/{conf_id}/dignitaries", response_model=Dict[str, Any])
def add_conference_dignitary(
    conf_id: str,
    payload: ConferenceDignitaryCreate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    _get_directory_dignitary(payload.directory_dignitary_id, supabase)
    existing = (
        supabase.table("conference_dignitaries")
        .select(CONFERENCE_ROSTER_SELECT)
        .eq("conference_id", conf_id)
        .eq("directory_dignitary_id", payload.directory_dignitary_id)
        .execute()
    )
    if existing.data:
        return _flatten_roster_entry(existing.data[0], _fetch_assignment_map(supabase, conf_id), {}, {})

    res = (
        supabase.table("conference_dignitaries")
        .insert(
            {
                "conference_id": conf_id,
                "directory_dignitary_id": payload.directory_dignitary_id,
                "created_by": user.id,
            }
        )
        .execute()
    )
    created = _get_roster_entry(res.data[0]["id"], supabase)
    return _flatten_roster_entry(created, _fetch_assignment_map(supabase, conf_id), {}, {})


@directory_router.get("/", response_model=List[Dict[str, Any]])
def get_directory_dignitaries(
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    res = supabase.table("dignitary_directory").select("*").order("name", desc=False).execute()
    return res.data


@directory_router.post("/", response_model=Dict[str, Any])
def create_directory_dignitary(
    dignitary: DirectoryDignitaryCreate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    data = dignitary.model_dump(exclude_unset=True)
    data["created_by"] = user.id
    res = supabase.table("dignitary_directory").insert(data).execute()
    return res.data[0]


@directory_router.post("/upload-photo", response_model=Dict[str, str])
async def upload_directory_dignitary_photo(
    request: Request,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    try:
        form = await request.form()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Photo upload requires multipart form support in the backend environment.",
        ) from exc

    file = form.get("file")
    if file is None:
        raise HTTPException(status_code=400, detail="No file was uploaded")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG, and WebP images are allowed")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller")

    _ensure_dignitary_image_bucket(supabase)

    extension = Path(file.filename or "").suffix.lower() or ALLOWED_IMAGE_TYPES[content_type]
    if extension not in ALLOWED_IMAGE_TYPES.values():
        extension = ALLOWED_IMAGE_TYPES[content_type]

    safe_name = _slugify_filename(file.filename or "image")
    storage_path = f"directory/{user.id}/{uuid4().hex}-{safe_name}{extension}"

    try:
        supabase.storage.from_(DIGNITARY_IMAGE_BUCKET).upload(
            storage_path,
            file_bytes,
            {"content-type": content_type, "x-upsert": "false"},
        )
    except StorageException as exc:
        raise HTTPException(status_code=400, detail=f"Image upload failed: {exc}") from exc

    picture_url = supabase.storage.from_(DIGNITARY_IMAGE_BUCKET).get_public_url(storage_path)
    return {"picture_url": picture_url, "storage_path": storage_path}


@directory_router.patch("/{directory_dignitary_id}", response_model=Dict[str, Any])
def update_directory_dignitary(
    directory_dignitary_id: str,
    dignitary: DirectoryDignitaryUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    data = dignitary.model_dump(exclude_unset=True)
    data["updated_at"] = "now()"
    res = (
        supabase.table("dignitary_directory")
        .update(data)
        .eq("id", directory_dignitary_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Directory dignitary not found")
    return res.data[0]


@directory_router.delete("/{directory_dignitary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_directory_dignitary(
    directory_dignitary_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    supabase.table("dignitary_directory").delete().eq("id", directory_dignitary_id).execute()
    return None


@nested_router.get("/{session_id}/dignitaries", response_model=List[Dict[str, Any]])
def get_dignitaries_for_session(
    session_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    res = (
        supabase.table("dignitaries")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .execute()
    )
    return res.data


@nested_router.post("/{session_id}/dignitaries", response_model=Dict[str, Any])
def create_dignitary(
    session_id: str,
    dignitary: DignitaryCreate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    payload = dignitary.model_dump(exclude_unset=True)
    session = _get_session_record(session_id, supabase)
    conference_dignitary_id = payload.get("conference_dignitary_id")
    if not conference_dignitary_id:
        raise HTTPException(
            status_code=422,
            detail="Session dignitaries must be selected from the conference dignitary list.",
        )

    roster_entry = _get_roster_entry(conference_dignitary_id, supabase)
    if roster_entry.get("conference_id") != session.get("conference_id"):
        raise HTTPException(status_code=400, detail="Conference dignitary does not belong to this conference")

    source = roster_entry.get("dignitary") or {}
    data = {
        "session_id": session_id,
        "conference_dignitary_id": conference_dignitary_id,
        "directory_dignitary_id": roster_entry.get("directory_dignitary_id"),
        "name": source.get("name"),
        "title": source.get("title"),
        "church": source.get("church"),
        "extension": source.get("extension"),
        "picture_url": source.get("picture_url"),
        "section": payload.get("section"),
        "row_num": payload.get("row_num"),
        "col_num": payload.get("col_num"),
        "status": payload.get("status") or "pending",
        "notes": payload.get("notes"),
        "created_by": user.id,
    }

    res = supabase.table("dignitaries").insert(data).execute()
    created = res.data[0]
    _record_first_arrival_if_needed(
        supabase,
        created.get("conference_dignitary_id"),
        session_id,
        created.get("status", "pending"),
    )
    return created


@direct_router.get("/{dignitary_id}", response_model=Dict[str, Any])
def get_dignitary(
    dignitary_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    return _get_dignitary_or_404(dignitary_id, supabase)


@direct_router.patch("/{dignitary_id}", response_model=Dict[str, Any])
def update_dignitary(
    dignitary_id: str,
    dignitary: DignitaryUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    data = dignitary.model_dump(exclude_unset=True)
    existing = _get_dignitary_or_404(dignitary_id, supabase)
    if "status" in data and data["status"] != existing.get("status") and not _can_manage_status(supabase, user.id, existing):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the assigned protocol officer can change dignitary status.",
        )

    data["updated_at"] = "now()"
    res = supabase.table("dignitaries").update(data).eq("id", dignitary_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Dignitary not found")

    updated = res.data[0]
    _record_first_arrival_if_needed(
        supabase,
        updated.get("conference_dignitary_id"),
        updated["session_id"],
        updated.get("status", existing.get("status", "pending")),
    )
    return updated


@direct_router.patch("/{dignitary_id}/status", response_model=Dict[str, Any])
def update_dignitary_status(
    dignitary_id: str,
    status_update: DignitaryStatusUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    existing = _get_dignitary_or_404(dignitary_id, supabase)
    if not _can_manage_status(supabase, user.id, existing):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins or the assigned protocol officer can change dignitary status.",
        )

    res = (
        supabase.table("dignitaries")
        .update({"status": status_update.status, "updated_at": "now()"})
        .eq("id", dignitary_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Dignitary not found")

    updated = res.data[0]
    _record_first_arrival_if_needed(
        supabase,
        updated.get("conference_dignitary_id"),
        updated["session_id"],
        status_update.status,
    )
    return updated


@direct_router.delete("/conference-dignitaries/{conference_dignitary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conference_dignitary(
    conference_dignitary_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    supabase.table("conference_dignitaries").delete().eq("id", conference_dignitary_id).execute()
    return None


@direct_router.delete("/{dignitary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dignitary(
    dignitary_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    supabase.table("dignitaries").delete().eq("id", dignitary_id).execute()
    return None
