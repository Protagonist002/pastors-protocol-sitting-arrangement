from fastapi import APIRouter
from .endpoints import auditoriums, conferences, sessions, dignitaries, protocol_seats, users

api_router = APIRouter()

# --- Users ---
api_router.include_router(users.router, prefix="/users", tags=["users"])

# --- Conferences ---
api_router.include_router(conferences.router, prefix="/conferences", tags=["conferences"])

# --- Auditoriums ---
api_router.include_router(auditoriums.router, prefix="/auditoriums", tags=["auditoriums"])

# --- Sessions (nested under conferences for list/create, direct for get/update/delete) ---
# GET  /api/conferences/{conf_id}/sessions  — list sessions for a conference
# POST /api/conferences/{conf_id}/sessions  — create session in a conference
api_router.include_router(sessions.nested_router, prefix="/conferences", tags=["sessions"])
# GET    /api/sessions/{session_id}                — get a session
# PATCH  /api/sessions/{session_id}                — update a session
# PATCH  /api/sessions/{session_id}/seating-config — update seating config
# DELETE /api/sessions/{session_id}                — delete a session
api_router.include_router(sessions.direct_router, prefix="/sessions", tags=["sessions"])

# --- Dignitaries (nested under sessions for list/create, direct for get/update/delete) ---
# GET  /api/conferences/{conf_id}/dignitaries  — list dignitaries selected for a conference
# POST /api/conferences/{conf_id}/dignitaries  — add a directory dignitary to a conference
api_router.include_router(dignitaries.conference_router, prefix="/conferences", tags=["conference-dignitaries"])
# GET    /api/directory-dignitaries            — list master dignitaries
# POST   /api/directory-dignitaries            — create master dignitary
# PATCH  /api/directory-dignitaries/{id}       — update master dignitary
# DELETE /api/directory-dignitaries/{id}       — delete master dignitary
api_router.include_router(dignitaries.directory_router, prefix="/directory-dignitaries", tags=["directory-dignitaries"])
# GET  /api/sessions/{session_id}/dignitaries  — list dignitaries for a session
# POST /api/sessions/{session_id}/dignitaries  — create dignitary in a session
api_router.include_router(dignitaries.nested_router, prefix="/sessions", tags=["dignitaries"])
api_router.include_router(protocol_seats.nested_router, prefix="/sessions", tags=["protocol-seats"])
# GET    /api/dignitaries/{id}         — get a dignitary
# PATCH  /api/dignitaries/{id}         — update a dignitary
# PATCH  /api/dignitaries/{id}/status  — update dignitary status
# DELETE /api/dignitaries/conference-dignitaries/{id} — remove dignitary from conference roster
# DELETE /api/dignitaries/{id}         — delete a dignitary
api_router.include_router(dignitaries.direct_router, prefix="/dignitaries", tags=["dignitaries"])
api_router.include_router(protocol_seats.direct_router, prefix="/protocol-seats", tags=["protocol-seats"])
