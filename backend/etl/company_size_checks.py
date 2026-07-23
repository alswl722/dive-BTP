"""기업규모 신고값 정합성 판정 — 단일 원본(SSOT).

EDA(scripts/eda_company_size.py)와 프로덕션(company_view.py)이 '같은 판정'을 쓰도록
로직·상수를 여기 한 곳에 둔다. (validate_scores가 프로덕션과 어긋났던 드리프트 재발 방지)

방침(합의됨):
    결측 기업규모는 '유추하지 않는다'(미상 유지 → 스코어링 전체fallback). 대신 '신고값이
    실측과 법적으로 모순되는가'만 드러낸다 — 값을 지어내지 않고 사실만 밝히므로 위험이 없고
    발제 축①(서류 vs 실제 역량 검증)에 직접 기여한다.

정합성 판정 (법으로 확정된 것만, 지어낸 임계값 0):
    (a) 소상공인_종업원초과 — 소상공인 신고인데 종업원 ≥ 법정상한(제조·광업·건설·운수 10 / 기타 5)
        · 소상공인보호법 시행령
    (b) 중소_졸업선초과 — 소상공인/소기업/중기업 신고인데 3년평균 매출 > 1,500억(또는 자산 ≥ 5,000억).
        업종별 매출 상한(400~1,500억)의 최댓값을 넘으면 어느 업종이든 중소기업이 아니다.
        · 중소기업기본법 시행령 별표

    ⚠️ 매출·자산 단위 = 천원 (1억 = 100,000천원).
"""

from __future__ import annotations

import math

SIZE_ORDER = ["소상공인", "소기업", "중기업", "대기업"]
SME_LABELS = {"소상공인", "소기업", "중기업"}   # 졸업선 검사 대상(대기업 제외)

# (a) 소상공인 종업원 상한 — '미만'이어야 소상공인. 제조·광업·건설·운수=10, 그 외=5.
SANGONGIN_KSIC_10 = ("B", "C", "F", "H")
SANGONGIN_EMP_10 = 10
SANGONGIN_EMP_ETC = 5

# (b) 중소기업 졸업선 (천원)
EOK = 100_000                       # 1억원 = 100,000천원
SME_REVENUE_CEILING = 1_500 * EOK   # 3년평균 매출 1,500억 초과 → 중소기업 아님
LARGE_ASSET_CEILING = 5_000 * EOK   # 자산 5,000억 이상 → 대기업 편입


def _isnum(v) -> bool:
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def eok(chunwon) -> str:
    """천원 값을 '약 N억'으로 (단위 오독 방지)."""
    return "-" if not _isnum(chunwon) else f"{chunwon / EOK:,.0f}억"


def sangongin_threshold(ksic) -> int:
    """KSIC 앞자리로 소상공인 종업원 상한(10 or 5) 결정."""
    return SANGONGIN_EMP_10 if str(ksic).strip().upper()[:1] in SANGONGIN_KSIC_10 else SANGONGIN_EMP_ETC


def latest_valid(year_to_value: dict) -> float | None:
    """{연도: 값} 중 가장 최근 유효(비결측) 값. (groupby.last()와 동일 의미)"""
    for y in sorted(year_to_value, reverse=True):
        v = year_to_value[y]
        if _isnum(v):
            return float(v)
    return None


def recent3_mean(year_to_value: dict) -> float | None:
    """{연도: 값} 중 최근 3개 유효값 평균. (tail(3).mean()와 동일 의미 — 법정 매출은 3년평균)"""
    vals = []
    for y in sorted(year_to_value, reverse=True):
        v = year_to_value[y]
        if _isnum(v):
            vals.append(float(v))
        if len(vals) == 3:
            break
    return sum(vals) / len(vals) if vals else None


def check_company_size(size, ksic, emp_latest, rev_3y_mean, asset_latest) -> list[dict]:
    """단일 기업 정합성 판정 — 법정 기준 위반 목록(빈 리스트=정상).

    각 원소: {"rule": <코드>, "detail": <사람이 읽는 근거>}. 값을 고치지 않는다.
    size가 결측이면 판정 대상 아님(빈 리스트) — 유추하지 않기로 했으므로.
    """
    issues: list[dict] = []
    if size is None or str(size).strip() == "":
        return issues

    # (a) 소상공인 종업원 초과
    # KSIC가 결측/비정상이면 제조군(10) vs 기타(5) 판별 불가 → 오탐 방지 위해 스킵.
    ksic_valid = ksic is not None and str(ksic).strip()[:1].isalpha()
    if size == "소상공인" and _isnum(emp_latest) and ksic_valid:
        th = sangongin_threshold(ksic)
        if emp_latest >= th:
            issues.append({
                "rule": "소상공인_종업원초과",
                "detail": f"소상공인 신고이나 종업원 {int(emp_latest)}명 ≥ 법정 {th}명 (KSIC {ksic})",
            })

    # (b) 중소기업 졸업선 초과
    if size in SME_LABELS:
        if _isnum(rev_3y_mean) and rev_3y_mean > SME_REVENUE_CEILING:
            issues.append({
                "rule": "중소_졸업선_매출초과",
                "detail": f"{size} 신고이나 3년평균 매출 {eok(rev_3y_mean)} > 1,500억 (업종 무관 중소 상한)",
            })
        elif _isnum(asset_latest) and asset_latest >= LARGE_ASSET_CEILING:
            issues.append({
                "rule": "중소_졸업선_자산초과",
                "detail": f"{size} 신고이나 자산 {eok(asset_latest)} ≥ 5,000억 (대기업 편입선)",
            })
    return issues


def find_inconsistencies(df) -> list[dict]:
    """EDA 편의 — DataFrame(index=기업일련번호, cols: size/ksic/emp/rev3y/asset) 배치 판정.

    각 원소: {"company_id", "rule", "detail"}.
    """
    out = []
    for cid, r in df[df["size"].notna()].iterrows():
        for issue in check_company_size(r["size"], r["ksic"], r["emp"], r["rev3y"], r["asset"]):
            out.append({"company_id": cid, **issue})
    return out
