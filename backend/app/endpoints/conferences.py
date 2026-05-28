from html import escape
import logging
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Response, status
from postgrest.exceptions import APIError
from supabase import Client
from typing import Any, Dict, List

from ..auth import get_current_user, require_admin, require_editor_or_admin
from ..db import get_supabase
from ..postgrest_utils import (
    is_missing_relation_error,
    is_missing_schema_field_error,
    raise_postgrest_http_exception,
    strip_missing_field,
)
from ..schemas import ConferenceCreate, ConferenceProtocolAssignmentUpdate, ConferenceUpdate
from ..time_utils import utc_now_iso

router = APIRouter()
CONFERENCE_SELECT = "*, auditorium:auditoriums(*)"
logger = logging.getLogger(__name__)


def _raise_conference_schema_error(error: Exception) -> None:
    missing_fields = [
        field_name
        for field_name in ("time", "start_date", "end_date", "auditorium_id", "all_protocols_can_update_status", "created_by", "updated_at")
        if is_missing_schema_field_error(error, "conferences", field_name)
    ]
    if missing_fields:
        fields = ", ".join(missing_fields)
        if missing_fields == ["all_protocols_can_update_status"]:
            raise_postgrest_http_exception(
                error,
                (
                    "Your Supabase conferences table is missing field: all_protocols_can_update_status. "
                    "Run backend/access_and_protocol_seating_migration.sql in Supabase SQL Editor."
                ),
            )
        raise_postgrest_http_exception(
            error,
            (
                f"Your Supabase conferences table is missing field(s): {fields}. "
                "Run backend/supabase_schema.sql. If this project predates auditorium or time support, "
                "also run backend/auditoriums_directory_migration.sql and backend/conference_time_migration.sql."
            ),
        )

    raise_postgrest_http_exception(error)


def _strip_missing_conference_fields(data: Dict[str, Any], error: APIError) -> Dict[str, Any] | None:
    retry_data = dict(data)
    stripped = False
    if strip_missing_field(retry_data, error, "conferences", "time") is not None:
        retry_data.pop("time", None)
        stripped = True
    if (
        is_missing_schema_field_error(error, "conferences", "start_date")
        or is_missing_schema_field_error(error, "conferences", "end_date")
    ):
        retry_data.pop("start_date", None)
        retry_data.pop("end_date", None)
        stripped = True
    return retry_data if stripped else None


def _time_query(label: str, conf_id: str, operation):
    started_at = perf_counter()
    res = operation()
    elapsed_ms = (perf_counter() - started_at) * 1000
    row_count = len(res.data or []) if isinstance(getattr(res, "data", None), list) else int(bool(getattr(res, "data", None)))
    logger.info(
        "control_center_query conf_id=%s query=%s rows=%s elapsed_ms=%.1f",
        conf_id,
        label,
        row_count,
        elapsed_ms,
    )
    return res


def _get_conference_or_404(supabase: Client, conf_id: str) -> Dict[str, Any]:
    res = supabase.table("conferences").select(CONFERENCE_SELECT).eq("id", conf_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Conference not found")
    return res.data[0]


def _clean_optional_text(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _normalize_conference_dates(data: Dict[str, Any]) -> Dict[str, Any]:
    if data.get("end_date") and not (data.get("start_date") or data.get("date")):
        raise HTTPException(status_code=400, detail="Conference start date is required when an end date is set")
    if data.get("start_date") and data.get("end_date") and data["end_date"] < data["start_date"]:
        raise HTTPException(status_code=400, detail="Conference end date cannot be before the start date")
    if data.get("start_date") and not data.get("date"):
        data["date"] = data["start_date"]
    return data


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


def _fetch_directory_map(supabase: Client, directory_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not directory_ids:
        return {}
    res = (
        supabase.table("dignitary_directory")
        .select("id,name,title,church,extension,picture_url")
        .in_("id", list(set(directory_ids)))
        .execute()
    )
    return {row["id"]: row for row in (res.data or [])}


def _fetch_roster_map(supabase: Client, roster_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not roster_ids:
        return {}
    res = supabase.table("conference_dignitaries").select("*").in_("id", list(set(roster_ids))).execute()
    return {row["id"]: row for row in (res.data or [])}


def _get_roster_entry_for_conference(
    supabase: Client,
    conf_id: str,
    roster_or_directory_id: str,
) -> Dict[str, Any] | None:
    roster = (
        supabase.table("conference_dignitaries")
        .select("*")
        .eq("conference_id", conf_id)
        .eq("id", roster_or_directory_id)
        .execute()
    )
    if roster.data:
        return roster.data[0]

    fallback = (
        supabase.table("conference_dignitaries")
        .select("*")
        .eq("conference_id", conf_id)
        .eq("directory_dignitary_id", roster_or_directory_id)
        .execute()
    )
    if fallback.data:
        return fallback.data[0]
    return None


def _enrich_protocol_assignments(
    assignments: List[Dict[str, Any]],
    profile_map: Dict[str, Dict[str, Any]],
    roster_map: Dict[str, Dict[str, Any]],
    directory_map: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    enriched = []
    for assignment in assignments:
        roster = roster_map.get(assignment.get("assigned_conference_dignitary_id"))
        directory = directory_map.get(roster.get("directory_dignitary_id")) if roster else None
        enriched.append(
            {
                **assignment,
                "user_profile": profile_map.get(assignment["user_id"]),
                "assigned_dignitary": directory,
            }
        )
    return enriched


def _fetch_assignment_map_for_roster(supabase: Client, conf_id: str) -> Dict[str, Dict[str, Any]]:
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


def _format_doc_datetime(value: Any) -> str:
    if not value:
        return "Not arrived yet"
    return str(value).replace("T", " ")


def _build_arrivals_doc(conference: Dict[str, Any], rows: List[Dict[str, Any]]) -> str:
    conference_name = escape(conference.get("name") or "Conference")
    conference_date = escape(
        str(
            conference.get("start_date")
            or conference.get("date")
            or "Date not set"
        )
    )
    if conference.get("end_date") and conference.get("end_date") != (conference.get("start_date") or conference.get("date")):
        conference_date = f"{conference_date} - {escape(str(conference.get('end_date')))}"
    conference_venue = escape(conference.get("venue") or "Venue not set")
    generated_rows = []

    for row in rows:
        generated_rows.append(
            """
            <tr>
              <td>{name}</td>
              <td>{title}</td>
              <td>{church}</td>
              <td>{extension}</td>
              <td>{protocol}</td>
              <td>{arrival_time}</td>
              <td>{arrival_session}</td>
            </tr>
            """.format(
                name=escape(row.get("dignitary_name") or ""),
                title=escape(row.get("title") or ""),
                church=escape(row.get("church") or ""),
                extension=escape(row.get("extension") or ""),
                protocol=escape(row.get("assigned_protocol") or ""),
                arrival_time=escape(_format_doc_datetime(row.get("first_arrival_time"))),
                arrival_session=escape(row.get("first_arrival_session") or "Not arrived yet"),
            ).strip()
        )

    table_rows = "\n".join(generated_rows) or """
      <tr>
        <td colspan="7">No dignitaries have been attached to this conference yet.</td>
      </tr>
    """.strip()

    return f"""<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>{conference_name} Arrivals</title>
    <style>
      body {{
        font-family: Calibri, Arial, sans-serif;
        color: #1f2937;
        margin: 32px;
      }}
      h1 {{
        margin: 0 0 8px;
        font-size: 26px;
      }}
      .meta {{
        margin: 0 0 24px;
        color: #4b5563;
        font-size: 14px;
      }}
      table {{
        width: 100%;
        border-collapse: collapse;
      }}
      th, td {{
        border: 1px solid #d1d5db;
        padding: 10px 12px;
        text-align: left;
        vertical-align: top;
      }}
      th {{
        background: #f3f4f6;
        font-weight: 700;
      }}
      tr:nth-child(even) td {{
        background: #fafafa;
      }}
    </style>
  </head>
  <body>
    <h1>{conference_name} Arrivals</h1>
    <p class="meta">Date: {conference_date}<br />Venue: {conference_venue}</p>
    <table>
      <thead>
        <tr>
          <th>Dignitary</th>
          <th>Title</th>
          <th>Church</th>
          <th>Extension</th>
          <th>Assigned Protocol</th>
          <th>First Arrival Time</th>
          <th>First Arrival Session</th>
        </tr>
      </thead>
      <tbody>
        {table_rows}
      </tbody>
    </table>
  </body>
</html>"""


@router.get("/", response_model=List[Dict[str, Any]])
def get_conferences(
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    res = supabase.table("conferences").select(CONFERENCE_SELECT).order("created_at", desc=True).execute()
    return res.data


@router.get("/{conf_id}", response_model=Dict[str, Any])
def get_conference(
    conf_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(get_current_user),
):
    return _get_conference_or_404(supabase, conf_id)


@router.get("/{conf_id}/control-center", response_model=Dict[str, Any])
def get_conference_control_center(
    conf_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    request_started_at = perf_counter()
    conference_res = _time_query(
        "conference",
        conf_id,
        lambda: supabase.table("conferences").select(CONFERENCE_SELECT).eq("id", conf_id).execute(),
    )
    if not conference_res.data:
        raise HTTPException(status_code=404, detail="Conference not found")
    conference = conference_res.data[0]

    sessions_res = _time_query(
        "sessions",
        conf_id,
        lambda: (
            supabase.table("sessions")
            .select("*")
            .eq("conference_id", conf_id)
            .order("date", desc=True)
            .execute()
        ),
    )
    sessions = sessions_res.data or []
    session_ids = [session["id"] for session in sessions]

    roster_res = _time_query(
        "conference_dignitaries",
        conf_id,
        lambda: (
            supabase.table("conference_dignitaries")
            .select("*, dignitary:dignitary_directory(*)")
            .eq("conference_id", conf_id)
            .order("created_at", desc=False)
            .execute()
        ),
    )
    roster_rows = roster_res.data or []

    try:
        assignments_res = _time_query(
            "conference_protocol_assignments",
            conf_id,
            lambda: (
                supabase.table("conference_protocol_assignments")
                .select("*")
                .eq("conference_id", conf_id)
                .execute()
            ),
        )
        assignments = assignments_res.data or []
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            assignments = []
        else:
            raise

    users_res = _time_query(
        "profiles",
        conf_id,
        lambda: supabase.table("profiles").select("*").order("created_at", desc=False).execute(),
    )
    users = users_res.data or []
    profile_map = {row["id"]: row for row in users}

    session_dignitaries = []
    if session_ids:
        dignitaries_res = _time_query(
            "session_dignitaries",
            conf_id,
            lambda: (
                supabase.table("dignitaries")
                .select("*")
                .in_("session_id", session_ids)
                .order("created_at", desc=False)
                .execute()
            ),
        )
        session_dignitaries = dignitaries_res.data or []

    first_arrival_session_ids = [row["first_arrival_session_id"] for row in roster_rows if row.get("first_arrival_session_id")]
    session_map_started_at = perf_counter()
    session_map = _fetch_session_map(
        supabase,
        first_arrival_session_ids,
    )
    logger.info(
        "control_center_query conf_id=%s query=first_arrival_sessions rows=%s elapsed_ms=%.1f",
        conf_id,
        len(session_map),
        (perf_counter() - session_map_started_at) * 1000,
    )
    assignment_by_roster_id = {
        row["assigned_conference_dignitary_id"]: row
        for row in assignments
        if row.get("assigned_conference_dignitary_id")
    }

    roster = []
    for row in roster_rows:
        dignitary = row.get("dignitary") or {}
        assignment = assignment_by_roster_id.get(row.get("id"))
        assigned_profile = profile_map.get(assignment.get("user_id")) if assignment else None
        roster.append({
            **dignitary,
            "id": row.get("id"),
            "conference_dignitary_id": row.get("id"),
            "conference_id": row.get("conference_id"),
            "directory_dignitary_id": row.get("directory_dignitary_id") or dignitary.get("id"),
            "created_at": row.get("created_at"),
            "first_arrival_at": row.get("first_arrival_at"),
            "first_arrival_session_id": row.get("first_arrival_session_id"),
            "first_arrival_session": session_map.get(row.get("first_arrival_session_id")),
            "assigned_protocol_user_id": assignment.get("user_id") if assignment else None,
            "assigned_protocol_name": assigned_profile.get("full_name") if assigned_profile else None,
            "assigned_protocol_profile": assigned_profile,
            "conference_role": assignment.get("conference_role") if assignment else None,
        })

    roster_by_id = {row["id"]: row for row in roster_rows}
    directory_ids = [
        row["directory_dignitary_id"]
        for row in roster_by_id.values()
        if row.get("directory_dignitary_id")
    ]
    directory_map_started_at = perf_counter()
    directory_map = _fetch_directory_map(
        supabase,
        directory_ids,
    )
    logger.info(
        "control_center_query conf_id=%s query=assignment_directory rows=%s elapsed_ms=%.1f",
        conf_id,
        len(directory_map),
        (perf_counter() - directory_map_started_at) * 1000,
    )
    enrich_started_at = perf_counter()
    enriched_assignments = _enrich_protocol_assignments(assignments, profile_map, roster_by_id, directory_map)
    logger.info(
        "control_center_step conf_id=%s step=enrich_assignments rows=%s elapsed_ms=%.1f",
        conf_id,
        len(enriched_assignments),
        (perf_counter() - enrich_started_at) * 1000,
    )

    session_dignitaries_by_session_id = {session_id: [] for session_id in session_ids}
    for dignitary in session_dignitaries:
        session_dignitaries_by_session_id.setdefault(dignitary.get("session_id"), []).append(dignitary)

    elapsed_ms = (perf_counter() - request_started_at) * 1000
    logger.info(
        "control_center_total conf_id=%s sessions=%s roster=%s assignments=%s users=%s session_dignitaries=%s elapsed_ms=%.1f",
        conf_id,
        len(sessions),
        len(roster),
        len(enriched_assignments),
        len(users),
        len(session_dignitaries),
        elapsed_ms,
    )

    return {
        "conference": conference,
        "sessions": sessions,
        "roster": roster,
        "assignments": enriched_assignments,
        "users": users,
        "sessionDignitariesBySessionId": session_dignitaries_by_session_id,
    }


@router.post("/", response_model=Dict[str, Any])
def create_conference(
    conf: ConferenceCreate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    data = conf.model_dump(mode="json", exclude_unset=True)
    for key in ("name", "venue", "description", "auditorium_id"):
        if key in data:
            data[key] = _clean_optional_text(data[key])
    data = _normalize_conference_dates(data)
    data["created_by"] = user.id
    try:
        res = supabase.table("conferences").insert(data).execute()
    except APIError as exc:
        retry_data = _strip_missing_conference_fields(data, exc)
        if retry_data is not None:
            res = supabase.table("conferences").insert(retry_data).execute()
        else:
            _raise_conference_schema_error(exc)
    return res.data[0]


@router.patch("/{conf_id}", response_model=Dict[str, Any])
def update_conference(
    conf_id: str,
    conf: ConferenceUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_editor_or_admin),
):
    data = conf.model_dump(mode="json", exclude_unset=True)
    for key in ("name", "venue", "description", "auditorium_id"):
        if key in data:
            data[key] = _clean_optional_text(data[key])
    data = _normalize_conference_dates(data)
    data["updated_at"] = utc_now_iso()
    try:
        res = supabase.table("conferences").update(data).eq("id", conf_id).execute()
    except APIError as exc:
        retry_data = _strip_missing_conference_fields(data, exc)
        if retry_data is not None:
            res = supabase.table("conferences").update(retry_data).eq("id", conf_id).execute()
        else:
            _raise_conference_schema_error(exc)
    if not res.data:
        raise HTTPException(status_code=404, detail="Conference not found")
    return res.data[0]


@router.get("/{conf_id}/protocol-assignments", response_model=List[Dict[str, Any]])
def get_conference_protocol_assignments(
    conf_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    _get_conference_or_404(supabase, conf_id)
    try:
        res = (
            supabase.table("conference_protocol_assignments")
            .select("*")
            .eq("conference_id", conf_id)
            .order("created_at", desc=False)
            .execute()
        )
        assignments = res.data or []
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            return []
        raise
    profile_map = _fetch_profile_map(supabase, [row["user_id"] for row in assignments])
    roster_map = _fetch_roster_map(
        supabase,
        [row["assigned_conference_dignitary_id"] for row in assignments if row.get("assigned_conference_dignitary_id")],
    )
    directory_map = _fetch_directory_map(
        supabase,
        [row["directory_dignitary_id"] for row in roster_map.values() if row.get("directory_dignitary_id")],
    )
    return _enrich_protocol_assignments(assignments, profile_map, roster_map, directory_map)


@router.put("/{conf_id}/protocol-assignments/{user_id}", response_model=Dict[str, Any])
def upsert_conference_protocol_assignment(
    conf_id: str,
    user_id: str,
    payload: ConferenceProtocolAssignmentUpdate,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    _get_conference_or_404(supabase, conf_id)
    assignment_table_missing_error = HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Protocol assignment tables are not available yet. Run the latest Supabase migration first.",
    )

    profile = supabase.table("profiles").select("*").eq("id", user_id).execute()
    if not profile.data:
        raise HTTPException(status_code=404, detail="User not found")
    profile_row = profile.data[0]
    if profile_row.get("role") != "protocol":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only protocol users can receive conference assignments.",
        )

    assignment_data = payload.model_dump(exclude_unset=True)
    conference_role = _clean_optional_text(assignment_data.get("conference_role"))
    assigned_dignitary_id = _clean_optional_text(assignment_data.get("assigned_conference_dignitary_id"))
    if assigned_dignitary_id:
        roster = _get_roster_entry_for_conference(supabase, conf_id, assigned_dignitary_id)
        if not roster:
            raise HTTPException(status_code=400, detail="Assigned dignitary must belong to this conference")
        assigned_dignitary_id = roster["id"]

    try:
        existing = (
            supabase.table("conference_protocol_assignments")
            .select("*")
            .eq("conference_id", conf_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        if is_missing_relation_error(exc, "conference_protocol_assignments"):
            raise assignment_table_missing_error from exc
        raise
    existing_assignment = existing.data[0] if existing.data else None

    if assigned_dignitary_id:
        try:
            duplicate_assignment = (
                supabase.table("conference_protocol_assignments")
                .select("*")
                .eq("conference_id", conf_id)
                .eq("assigned_conference_dignitary_id", assigned_dignitary_id)
                .execute()
            )
        except Exception as exc:
            if is_missing_relation_error(exc, "conference_protocol_assignments"):
                raise assignment_table_missing_error from exc
            raise

        duplicate_owner = next(
            (
                row
                for row in (duplicate_assignment.data or [])
                if row.get("user_id") != user_id
            ),
            None,
        )
        if duplicate_owner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That dignitary is already assigned to another protocol officer in this conference.",
            )

    if not conference_role and not assigned_dignitary_id:
        if existing_assignment:
            try:
                supabase.table("conference_protocol_assignments").delete().eq("id", existing_assignment["id"]).execute()
            except Exception as exc:
                if is_missing_relation_error(exc, "conference_protocol_assignments"):
                    raise assignment_table_missing_error from exc
                raise
        return {
            "conference_id": conf_id,
            "user_id": user_id,
            "conference_role": None,
            "assigned_conference_dignitary_id": None,
            "user_profile": profile_row,
            "assigned_dignitary": None,
        }

    upsert_payload = {
        "conference_id": conf_id,
        "user_id": user_id,
        "conference_role": conference_role,
        "assigned_conference_dignitary_id": assigned_dignitary_id,
        "updated_at": utc_now_iso(),
    }
    if existing_assignment:
        try:
            res = (
                supabase.table("conference_protocol_assignments")
                .update(upsert_payload)
                .eq("conference_id", conf_id)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as exc:
            if is_missing_relation_error(exc, "conference_protocol_assignments"):
                raise assignment_table_missing_error from exc
            raise
        assignment = res.data[0]
    else:
        upsert_payload["created_by"] = user.id
        try:
            res = supabase.table("conference_protocol_assignments").insert(upsert_payload).execute()
        except Exception as exc:
            if is_missing_relation_error(exc, "conference_protocol_assignments"):
                raise assignment_table_missing_error from exc
            raise
        assignment = res.data[0]

    roster_map = _fetch_roster_map(supabase, [assignment.get("assigned_conference_dignitary_id")] if assignment.get("assigned_conference_dignitary_id") else [])
    directory_map = _fetch_directory_map(
        supabase,
        [row["directory_dignitary_id"] for row in roster_map.values() if row.get("directory_dignitary_id")],
    )
    enriched = _enrich_protocol_assignments([assignment], {user_id: profile_row}, roster_map, directory_map)
    return enriched[0]


@router.get("/{conf_id}/arrival-export", response_class=Response)
def export_conference_arrivals(
    conf_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    conference = _get_conference_or_404(supabase, conf_id)
    roster_res = (
        supabase.table("conference_dignitaries")
        .select("*")
        .eq("conference_id", conf_id)
        .order("created_at", desc=False)
        .execute()
    )
    roster = roster_res.data or []

    directory_map = _fetch_directory_map(
        supabase,
        [row["directory_dignitary_id"] for row in roster if row.get("directory_dignitary_id")],
    )
    assignment_map = _fetch_assignment_map_for_roster(supabase, conf_id)
    profile_map = _fetch_profile_map(
        supabase,
        [row["user_id"] for row in assignment_map.values() if row.get("user_id")],
    )
    session_map = _fetch_session_map(
        supabase,
        [row["first_arrival_session_id"] for row in roster if row.get("first_arrival_session_id")],
    )

    export_rows = []
    for row in roster:
        dignitary = directory_map.get(row.get("directory_dignitary_id"), {})
        assignment = assignment_map.get(row.get("id"), {})
        protocol_profile = profile_map.get(assignment.get("user_id"), {})
        arrival_session = session_map.get(row.get("first_arrival_session_id"), {})
        export_rows.append(
            {
                "dignitary_name": dignitary.get("name", ""),
                "title": dignitary.get("title", ""),
                "church": dignitary.get("church", ""),
                "extension": dignitary.get("extension", ""),
                "assigned_protocol": protocol_profile.get("full_name", ""),
                "first_arrival_time": row.get("first_arrival_at", "") or "",
                "first_arrival_session": arrival_session.get("name", "") or "",
            }
        )

    document = _build_arrivals_doc(conference, export_rows)
    filename = f'{conference["name"].lower().replace(" ", "-")}-arrivals.doc'
    return Response(
        content=document,
        media_type="application/msword",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{conf_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conference(
    conf_id: str,
    supabase: Client = Depends(get_supabase),
    user=Depends(require_admin),
):
    supabase.table("conferences").delete().eq("id", conf_id).execute()
    return None
