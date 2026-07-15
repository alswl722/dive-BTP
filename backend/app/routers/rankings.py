from fastapi import APIRouter

from app.schemas import Rankings
from app.services import companies as companies_service

router = APIRouter(tags=["rankings"])


@router.get("/rankings", response_model=Rankings)
def get_rankings():
    return companies_service.get_rankings()
