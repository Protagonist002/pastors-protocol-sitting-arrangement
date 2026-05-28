from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client
from typing import Any, Dict, List

from ..auth import get_current_user, get_profile_record
from ..db import get_supabase
from ..postgrest_utils import is_missing_relation_error
from ..schemas import ProtocolSeatCreate, ProtocolSeatUpdate
from ..time_utils import utc_now_iso

nested_router = APIRouter()
direct_router = APIRouter()


def _missing_protocol_seats_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Protocol seating is not available yet. Run backend/protocol_seats_migration.sql first.",
    )


def _get_session_record(supabase: Client, session_id: str) -> Dict[str, Any]:
    res = supabase.table("sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


def _get_protocol_seat_or_404(supabase: Client, protocol_seat_id: str) -> Dict[str, Any]:
    try:
        res = supabase.table("protocol_seats").select("*").eq("id", protocol_seat_id).execute()
    except Exception as exc:
        if is_missing_relation_error(exc, "protocol_seats"):
            raise _missing_protocol_seats_error() from exc
        raise
    if not res.data:
        raise HTTPException(status_code=404, detail="Protocol seat not found")
    return res.data[0]


def _fetch_map(supabase: Client, table: str, ids: List[str], columns: str = "*") -> Dict[str, Dict[str, Any]]:
    unique_ids = list({item for item in ids if item})
    if not unique_ids:
        return {}
    res = supabase.table(table).select(columns).in_("id", unique_ids).execute()
    return {row["id"]: row for row in (res.data or [])}


def _get_roster_entry_for_conference(
    supabase: Client,
    conference_id: str,
    conference_dignitary_id: str,
) -> Dict[str, Any] | None:
    res = (
        supabase.table("conference_dignitaries")
        .select("*")
        .eq("conference_id", conference_id)
        .eq("id", conference_dignitary_id)
        .execute()
    )
    return res.data[0] if res.data else None


def _is_assigned_protocol(
    supabase: Client,
    conference_id: str,
    user_id: str,
    assigned_conference_dignitary_id: str,
) -> bool:
    try:
        res = (
            supabase.table("conference_protocol_assignments")
            .select("id")
            .eq("conference_id", conference_id)
            .eq("user_id", user_id)
            .eq("assigned_conference_dignitary_id", assigned_conference_dignitary_id)
            .execute()
        )
        return bool(res.data)
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            return False
        raise


def _can_manage_protocol_seat(
    supabase: Client,
    current_user_id: str,
    profile: Dict[str, Any],
    session: Dict[str, Any],
    seat: Dict[str, Any],
) -> bool:
    if profile.get("role") in ("admin", "editor"):
        return True
    if seat.get("user_id") != current_user_id:
        return False
    return _is_assigned_protocol(
        supabase,
        session.get("conference_id"),
        seat.get("user_id"),
        seat.get("assigned_conference_dignitary_id"),
    )


def _check_seat_available(
    supabase: Client,
    session_id: str,
    section: str | None,
    row_num: int | None,
    col_num: int | None,
    ignore_protocol_seat_id: str | None = None,
) -> None:
    if not section or not row_num or not col_num:
        return

    dignitary_res = (
        supabase.table("dignitaries")
        .select("id,name")
        .eq("session_id", session_id)
        .eq("section", section)
        .eq("row_num", row_num)
        .eq("col_num", col_num)
        .execute()
    )
    if dignitary_res.data:
        raise HTTPException(status_code=400, detail="That seat is already assigned to a dignitary.")

    try:
        protocol_query = (
            supabase.table("protocol_seats")
            .select("id")
            .eq("session_id", session_id)
            .eq("section", section)
            .eq("row_num", row_num)
            .eq("col_num", col_num)
        )
        if ignore_protocol_seat_id:
            protocol_query = protocol_query.neq("id", ignore_protocol_seat_id)
        protocol_res = protocol_query.execute()
    except Exception as exc:
        if is_missing_relation_error(exc, "protocol_seats"):
            raise _missing_protocol_seats_error() from exc
        raise
    if protocol_res.data:
        raise HTTPException(status_code=400, detail="That seat is already assigned to a protocol officer.")


def _enrich_protocol_seats(supabase: Client, seats: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    profile_map = _fetch_map(
        supabase,
        "profiles",
        [row.get("user_id") for row in seats],
        "id,full_name,role,extension,picture_url",
    )
    roster_map = _fetch_map(
        supabase,
        "conference_dignitaries",
        [row.get("assigned_conference_dignitary_id") for row in seats],
        "id,directory_dignitary_id",
    )
    directory_map = _fetch_map(
        supabase,
        "dignitary_directory",
        [row.get("directory_dignitary_id") for row in roster_map.values()],
        "id,name,title,church,extension,picture_url",
    )

    enriched = []
    for row in seats:
        profile = profile_map.get(row.get("user_id")) or {}
        roster = roster_map.get(row.get("assigned_conference_dignitary_id")) or {}
        assigned_dignitary = directory_map.get(roster.get("directory_dignitary_id"))
        enriched.append(
            {
                **row,
                "protocol_name": profile.get("full_name"),
                "protocol_extension": profile.get("extension"),
                "protocol_picture_url": profile.get("picture_url"),
                "protocol_profile": profile,
                "assigned_dignitary": assigned_dignitary,
            }
        )
    return enriched


def _enrich_assignment_options(supabase: Client, assignments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    profile_map = _fetch_map(
        supabase,
        "profiles",
        [row.get("user_id") for row in assignments],
        "id,full_name,role,extension,picture_url",
    )
    roster_map = _fetch_map(
        supabase,
        "conference_dignitaries",
        [row.get("assigned_conference_dignitary_id") for row in assignments],
        "id,directory_dignitary_id",
    )
    directory_map = _fetch_map(
        supabase,
        "dignitary_directory",
        [row.get("directory_dignitary_id") for row in roster_map.values()],
        "id,name,title,church,extension,picture_url",
    )

    options = []
    for row in assignments:
        if not row.get("assigned_conference_dignitary_id"):
            continue
        roster = roster_map.get(row.get("assigned_conference_dignitary_id")) or {}
        options.append(
            {
                **row,
                "user_profile": profile_map.get(row.get("user_id")),
                "assigned_dignitary": directory_map.get(roster.get("directory_dignitary_id")),
            }
        )
    return options


@nested_router.get("/{session_id}/protocol-seats", response_model=List[Dict[str, Any]])
def get_protocol_seats_for_session(
    session_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    _get_session_record(supabase, session_id)
    try:
        res = (
            supabase.table("protocol_seats")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as exc:
        if is_missing_relation_error(exc, "protocol_seats"):
            return []
        raise
    return _enrich_protocol_seats(supabase, res.data or [])


@nested_router.get("/{session_id}/protocol-seat-options", response_model=List[Dict[str, Any]])
def get_protocol_seat_options(
    session_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    session = _get_session_record(supabase, session_id)
    profile = get_profile_record(supabase, user.id)
    try:
        query = (
            supabase.table("conference_protocol_assignments")
            .select("*")
            .eq("conference_id", session.get("conference_id"))
            .order("created_at", desc=False)
        )
        if profile.get("role") not in ("admin", "editor"):
            query = query.eq("user_id", user.id)
        res = query.execute()
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            return []
        raise
    return _enrich_assignment_options(supabase, res.data or [])


@nested_router.post("/{session_id}/protocol-seats", response_model=Dict[str, Any])
def create_protocol_seat(
    session_id: str,
    payload: ProtocolSeatCreate,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    session = _get_session_record(supabase, session_id)
    profile = get_profile_record(supabase, user.id)
    roster = _get_roster_entry_for_conference(
        supabase,
        session.get("conference_id"),
        payload.assigned_conference_dignitary_id,
    )
    if not roster:
        raise HTTPException(status_code=400, detail="Assigned dignitary must belong to this conference.")
    if not _is_assigned_protocol(
        supabase,
        session.get("conference_id"),
        payload.user_id,
        roster.get("id"),
    ):
        raise HTTPException(
            status_code=400,
            detail="Protocol officer must be assigned to this dignitary before they can receive a protocol seat.",
        )

    seat = {
        "session_id": session_id,
        "user_id": payload.user_id,
        "assigned_conference_dignitary_id": roster.get("id"),
        "section": payload.section,
        "row_num": payload.row_num,
        "col_num": payload.col_num,
        "notes": payload.notes,
    }
    if not _can_manage_protocol_seat(supabase, user.id, profile, session, seat):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins, editors, or the assigned protocol officer can seat this protocol officer.",
        )

    _check_seat_available(supabase, session_id, payload.section, payload.row_num, payload.col_num)
    try:
        res = (
            supabase.table("protocol_seats")
            .insert({**seat, "created_by": user.id})
            .execute()
        )
    except APIError as exc:
        message = str(exc).lower()
        if is_missing_relation_error(exc, "protocol_seats"):
            raise _missing_protocol_seats_error() from exc
        if "duplicate" in message or "unique" in message:
            raise HTTPException(status_code=400, detail="This protocol officer already has a seat in this session.") from exc
        raise
    return _enrich_protocol_seats(supabase, [res.data[0]])[0]


@direct_router.patch("/{protocol_seat_id}", response_model=Dict[str, Any])
def update_protocol_seat(
    protocol_seat_id: str,
    payload: ProtocolSeatUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    existing = _get_protocol_seat_or_404(supabase, protocol_seat_id)
    session = _get_session_record(supabase, existing.get("session_id"))
    profile = get_profile_record(supabase, user.id)
    if not _can_manage_protocol_seat(supabase, user.id, profile, session, existing):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins, editors, or the assigned protocol officer can edit this protocol seat.",
        )

    data = payload.model_dump(exclude_unset=True)
    section = data.get("section", existing.get("section"))
    row_num = data.get("row_num", existing.get("row_num"))
    col_num = data.get("col_num", existing.get("col_num"))
    _check_seat_available(
        supabase,
        existing.get("session_id"),
        section,
        row_num,
        col_num,
        ignore_protocol_seat_id=protocol_seat_id,
    )

    data["updated_at"] = utc_now_iso()
    res = supabase.table("protocol_seats").update(data).eq("id", protocol_seat_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Protocol seat not found")
    return _enrich_protocol_seats(supabase, [res.data[0]])[0]


@direct_router.delete("/{protocol_seat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protocol_seat(
    protocol_seat_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    existing = _get_protocol_seat_or_404(supabase, protocol_seat_id)
    session = _get_session_record(supabase, existing.get("session_id"))
    profile = get_profile_record(supabase, user.id)
    if not _can_manage_protocol_seat(supabase, user.id, profile, session, existing):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins, editors, or the assigned protocol officer can remove this protocol seat.",
        )
    supabase.table("protocol_seats").delete().eq("id", protocol_seat_id).execute()
    return None
