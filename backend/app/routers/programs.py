from fastapi import APIRouter

from app.schemas import Program
from app.services import programs as programs_service

router = APIRouter(tags=["programs"])


@router.get("/programs", response_model=list[Program])
def list_programs():
    return programs_service.list_programs()
