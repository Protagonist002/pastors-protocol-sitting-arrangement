from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from typing import List, Dict, Any
from ..db import get_supabase
from ..auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[Dict[str, Any]])
def get_auditoriums(
    supabase: Client = Depends(get_supabase),
    user = Depends(get_current_user),
):
    res = supabase.table("auditoriums").select("*").order("name").execute()
    return res.data


@router.get("/{auditorium_id}", response_model=Dict[str, Any])
def get_auditorium(
    auditorium_id: str,
    supabase: Client = Depends(get_supabase),
    user = Depends(get_current_user),
):
    res = supabase.table("auditoriums").select("*").eq("id", auditorium_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Auditorium not found")
    return res.data[0]
