from datetime import date as date_type, time as time_type
from pydantic import BaseModel
from typing import Literal, Optional


class RegisterUserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    extension: str


class RoleUpdate(BaseModel):
    role: Literal["admin", "editor", "protocol"]


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    extension: Optional[str] = None
    picture_url: Optional[str] = None


class ConferenceProtocolAssignmentUpdate(BaseModel):
    conference_role: Optional[str] = None
    assigned_conference_dignitary_id: Optional[str] = None


class ConferenceCreate(BaseModel):
    name: str
    date: Optional[date_type] = None
    time: Optional[time_type] = None
    venue: Optional[str] = None
    description: Optional[str] = None
    auditorium_id: Optional[str] = None


class ConferenceUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[date_type] = None
    time: Optional[time_type] = None
    venue: Optional[str] = None
    description: Optional[str] = None
    auditorium_id: Optional[str] = None


class SessionCreate(BaseModel):
    name: str
    date: Optional[date_type] = None
    time: Optional[time_type] = None
    description: Optional[str] = None
    seating_config: Optional[dict] = {}


class SessionUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[date_type] = None
    time: Optional[time_type] = None
    description: Optional[str] = None
    seating_config: Optional[dict] = None


class DignitaryCreate(BaseModel):
    conference_dignitary_id: Optional[str] = None
    directory_dignitary_id: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    church: Optional[str] = None
    extension: Optional[str] = None
    section: Optional[str] = None
    row_num: Optional[int] = None
    col_num: Optional[int] = None
    status: Optional[Literal["pending", "arrived", "seated", "absent"]] = "pending"
    notes: Optional[str] = None
    picture_url: Optional[str] = None


class DignitaryUpdate(BaseModel):
    conference_dignitary_id: Optional[str] = None
    directory_dignitary_id: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    church: Optional[str] = None
    extension: Optional[str] = None
    section: Optional[str] = None
    row_num: Optional[int] = None
    col_num: Optional[int] = None
    status: Optional[Literal["pending", "arrived", "seated", "absent"]] = None
    notes: Optional[str] = None
    picture_url: Optional[str] = None


class DignitaryStatusUpdate(BaseModel):
    status: Literal["pending", "arrived", "seated", "absent"]


class DirectoryDignitaryCreate(BaseModel):
    name: str
    title: str
    church: Optional[str] = None
    extension: Optional[str] = None
    notes: Optional[str] = None
    picture_url: Optional[str] = None


class DirectoryDignitaryUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    church: Optional[str] = None
    extension: Optional[str] = None
    notes: Optional[str] = None
    picture_url: Optional[str] = None


class ConferenceDignitaryCreate(BaseModel):
    directory_dignitary_id: str
