"""Pydantic 응답 스키마 — frontend/types/index.ts를 그대로 옮김(소스오브트루스는 그쪽).

필드가 어긋나면 FastAPI가 검증 단계에서 바로 에러를 내므로, 프론트 타입과의
불일치를 조기에 잡아준다.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Axis = Literal["성장성", "수익성", "효율성", "안정성"]
ReviewStatus = Literal["후보", "선정", "보류", "제외"]


class TrendPoint(BaseModel):
    year: int
    value: float | None = None


class SupportRecord(BaseModel):
    date: str
    result: Literal["선정", "탈락", "포기"]
    bizType: str
    amount: float
    programCode: str | None = None
    year: int | None = None


class Patents(BaseModel):
    등록: int | None = None
    출원: int | None = None


class Ntis(BaseModel):
    주관: int | None = None
    위탁: int | None = None


class Support(BaseModel):
    건수: int | None = None
    총지원금_천원: float | None = None
    지원연도수: int | None = None


class Passthrough(BaseModel):
    영업외손익비중: float | None = None
    자본잠식_플래그: float | None = None


class DataQuality(BaseModel):
    missing: list[str]
    ok: bool


class Company(BaseModel):
    id: int
    name: str
    industry: str | None = None
    industryCode: str | None = None
    region: str | None = None
    revenueLatest: float | None = None
    avgSalaryLatest: float | None = None
    scores: dict[Axis, float | None]
    percentiles: dict[str, float | None]
    rawMetrics: dict[str, float | None]
    trends: dict[str, list[TrendPoint]]
    certifications: dict[str, bool]
    patents: Patents
    ntis: Ntis
    support: Support
    supportHistory: list[SupportRecord]
    passthrough: Passthrough
    percentileBasis: str | None = None
    dataQuality: DataQuality
    reviewStatus: ReviewStatus = "후보"
    # company_view.py 산출물의 키는 "_mock"(밑줄 시작 = pydantic이 private로 취급하는
    # 이름이라 그대로 필드명으로 못 씀) → alias로 매핑. populate_by_name=True로 입력 시
    # "_mock"/"mock" 둘 다 받고, response_model_by_alias 기본값(True)이라 출력 JSON은
    # "_mock"으로 나가 프론트 타입(_mock: string[])과 그대로 맞음.
    mock: list[str] = Field(default_factory=list, alias="_mock")

    model_config = ConfigDict(populate_by_name=True)


class ReviewStatusUpdate(BaseModel):
    status: ReviewStatus


class ReviewStatusResponse(BaseModel):
    id: int
    reviewStatus: ReviewStatus


class RankingRow(BaseModel):
    id: int
    name: str
    industry: str | None = None
    건수: int | None = None
    총지원금_천원: float | None = None


class Rankings(BaseModel):
    byCount: list[RankingRow]
    byAmount: list[RankingRow]


class BizTypeCount(BaseModel):
    type: str
    count: int


class RegionCount(BaseModel):
    region: str
    count: int


class ResultCount(BaseModel):
    result: str
    count: int


class Program(BaseModel):
    year: int
    programCode: str
    name: str | None = None
    macroCategory: str | None = None  # 사업구분 원본(RnD/복합/기업지원 등, 값 혼재 — 필터엔 businessType 권장)
    businessType: str | None = None  # 사업유형 7종 + 사업기획 등(지원사업 목록 필터 기준 컬럼)
    startDate: str | None = None
    endDate: str | None = None
    ministry: str | None = None
    localGov: str | None = None
    description: str | None = None
    applicantCount: int  # support_records 매칭 신청기업수(중복 지원 제외 distinct)
    selectedCount: int  # 선정(지원대상) 기업수
    totalAmountThousand: float  # 선정 건 지원금 합계(천원)
    detailItems: list[str] = []  # 세부품목(support_detail_main) distinct. 신청이력 없는 사업은 빈 배열.


class Dashboard(BaseModel):
    totalCompanies: int
    bizTypeDist: list[BizTypeCount]
    regionDist: list[RegionCount]
    resultDist: list[ResultCount]
    dataQualityIssues: int
