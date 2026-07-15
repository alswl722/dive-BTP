from fastapi import APIRouter

from app.schemas import Dashboard
from app.services import companies as companies_service

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=Dashboard)
def get_dashboard():
    return companies_service.get_dashboard()
