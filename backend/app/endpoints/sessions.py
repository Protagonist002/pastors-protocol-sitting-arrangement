from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client
from typing import Any, Dict, List

from ..auth import get_current_user, require_admin, require_editor_or_admin
from ..db import get_supabase
from ..postgrest_utils import is_missing_schema_field_error, raise_postgrest_http_exception, strip_missing_field
from ..schemas import SessionCreate, SessionUpdate

nested_router = APIRouter()
direct_router = APIRouter()

SESSION_SELECT = "*, conference:conferences(*, auditorium:auditoriums(*))"


def _raise_session_schema_error(error: Exception) -> None:
    missing_fields = [
        field_name
        for field_name in ("time", "seating_config", "created_by", "updated_at")
        if is_missing_schema_field_error(error, "sessions", field_name)
    ]
    if missing_fields:
        fields = ", ".join(missing_fields)
        raise_postgrest_http_exception(
            error,
            (
                f"Your Supabase sessions table is missing field(s): {fields}. "
                "Run backend/supabase_schema.sql to bring the sessions schema up to date."
            ),
        )

    raise_postgrest_http_exception(error)


def _clean_optional_text(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


@nested_router.get("/{conf_id}/sessions", response_model=List[Dict[str, Any]])
def get_sessions_for_conference(
    conf_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    res = supabase.table("sessions").select("*").eq("conference_id", conf_id).order("date", desc=True).execute()
    return res.data


@nested_router.post("/{conf_id}/sessions", response_model=Dict[str, Any])
def create_session(
    conf_id: str,
    session: SessionCreate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    data = session.model_dump(mode="json", exclude_unset=True)
    for key in ("name", "description"):
        if key in data:
            data[key] = _clean_optional_text(data[key])
    data["conference_id"] = conf_id
    data["created_by"] = user.id
    if "seating_config" not in data or not data["seating_config"]:
        data["seating_config"] = {}
    try:
        res = supabase.table("sessions").insert(data).execute()
    except APIError as exc:
        retry_data = strip_missing_field(data, exc, "sessions", "time")
        if retry_data is not None:
            res = supabase.table("sessions").insert(retry_data).execute()
        else:
            _raise_session_schema_error(exc)
    return res.data[0]


@direct_router.get("/{session_id}", response_model=Dict[str, Any])
def get_session(
    session_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    res = supabase.table("sessions").select(SESSION_SELECT).eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


@direct_router.patch("/{session_id}", response_model=Dict[str, Any])
def update_session(
    session_id: str,
    session: SessionUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    data = session.model_dump(mode="json", exclude_unset=True)
    for key in ("name", "description"):
        if key in data:
            data[key] = _clean_optional_text(data[key])
    data["updated_at"] = "now()"
    try:
        res = supabase.table("sessions").update(data).eq("id", session_id).execute()
    except APIError as exc:
        retry_data = strip_missing_field(data, exc, "sessions", "time")
        if retry_data is not None:
            res = supabase.table("sessions").update(retry_data).eq("id", session_id).execute()
        else:
            _raise_session_schema_error(exc)
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


@direct_router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    supabase.table("sessions").delete().eq("id", session_id).execute()
    return None


@direct_router.patch("/{session_id}/seating-config", response_model=Dict[str, Any])
def update_seating_config(
    session_id: str,
    config: dict,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    res = (
        supabase.table("sessions")
        .update({"seating_config": config, "updated_at": "now()"})
        .eq("id", session_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


@direct_router.post("/{target_session_id}/clone-from/{source_session_id}", response_model=List[Dict[str, Any]])
def clone_arrangement(
    target_session_id: str,
    source_session_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    source = supabase.table("sessions").select("*").eq("id", source_session_id).execute()
    if not source.data:
        raise HTTPException(status_code=404, detail="Source session not found")

    target = supabase.table("sessions").select("*").eq("id", target_session_id).execute()
    if not target.data:
        raise HTTPException(status_code=404, detail="Target session not found")

    source_config = source.data[0].get("seating_config", {})
    if source_config:
        (
            supabase.table("sessions")
            .update({"seating_config": source_config, "updated_at": "now()"})
            .eq("id", target_session_id)
            .execute()
        )

    src_dignitaries = supabase.table("dignitaries").select("*").eq("session_id", source_session_id).execute()
    if not src_dignitaries.data:
        return []

    new_dignitaries = []
    for dignitary in src_dignitaries.data:
        new_dignitaries.append(
            {
                "session_id": target_session_id,
                "conference_dignitary_id": dignitary.get("conference_dignitary_id"),
                "directory_dignitary_id": dignitary.get("directory_dignitary_id"),
                "name": dignitary["name"],
                "title": dignitary["title"],
                "church": dignitary.get("church"),
                "extension": dignitary.get("extension"),
                "section": dignitary.get("section"),
                "row_num": dignitary.get("row_num"),
                "col_num": dignitary.get("col_num"),
                "status": "pending",
                "notes": dignitary.get("notes"),
                "picture_url": dignitary.get("picture_url"),
                "created_by": user.id,
            }
        )

    res = supabase.table("dignitaries").insert(new_dignitaries).execute()
    return res.data
