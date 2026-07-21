from fastapi import APIRouter, HTTPException

from app.schemas import (
    Company,
    ProgramReviewStatus,
    ReviewStatusResponse,
    ReviewStatusUpdate,
)
from app.services import companies as companies_service
from app.services import review_status as review_status_service

router = APIRouter(tags=["companies"])


@router.get("/companies", response_model=list[Company])
def list_companies():
    return companies_service.list_companies()


@router.get("/review-status", response_model=list[ProgramReviewStatus])
def list_review_statuses():
    """전체 (기업, 사업) 심사 상태 — 프론트가 초기 로드."""
    return review_status_service.get_all_statuses()


@router.get("/companies/{company_id}", response_model=Company)
def get_company(company_id: int):
    company = companies_service.get_company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail=f"company_id={company_id} 없음")
    return company


@router.patch("/companies/{company_id}/review-status", response_model=ReviewStatusResponse)
def update_review_status(company_id: int, body: ReviewStatusUpdate):
    if not companies_service.company_exists(company_id):
        raise HTTPException(status_code=404, detail=f"company_id={company_id} 없음")
    status = review_status_service.set_status(company_id, body.programKey, body.status)
    return ReviewStatusResponse(companyId=company_id, programKey=body.programKey, reviewStatus=status)
