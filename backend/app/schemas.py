"""Pydantic 응답 스키마 — frontend/types/index.ts를 그대로 옮김(소스오브트루스는 그쪽).

필드가 어긋나면 FastAPI가 검증 단계에서 바로 에러를 내므로, 프론트 타입과의
불일치를 조기에 잡아준다.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Axis = Literal["성장성", "수익성", "효율성", "안정성"]


class TrendPoint(BaseModel):
    year: int
    value: float | None = None


class SupportRecord(BaseModel):
    date: str
    result: Literal["선정", "탈락", "포기"]
    bizType: str
    amount: float


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
    # company_view.py 산출물의 키는 "_mock"(밑줄 시작 = pydantic이 private로 취급하는
    # 이름이라 그대로 필드명으로 못 씀) → alias로 매핑. populate_by_name=True로 입력 시
    # "_mock"/"mock" 둘 다 받고, response_model_by_alias 기본값(True)이라 출력 JSON은
    # "_mock"으로 나가 프론트 타입(_mock: string[])과 그대로 맞음.
    mock: list[str] = Field(default_factory=list, alias="_mock")

    model_config = ConfigDict(populate_by_name=True)


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


class Dashboard(BaseModel):
    totalCompanies: int
    bizTypeDist: list[BizTypeCount]
    regionDist: list[RegionCount]
    resultDist: list[ResultCount]
    dataQualityIssues: int
