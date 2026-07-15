from fastapi import APIRouter, HTTPException

from app.schemas import Company
from app.services import companies as companies_service

router = APIRouter(tags=["companies"])


@router.get("/companies", response_model=list[Company])
def list_companies():
    return companies_service.list_companies()


@router.get("/companies/{company_id}", response_model=Company)
def get_company(company_id: int):
    company = companies_service.get_company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail=f"company_id={company_id} 없음")
    return company
