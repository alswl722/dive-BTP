"""기술력 3축 파생컬럼 산출 (축4 R&D·특허 / 축5 인증 / 축6 NTIS).

aggregate_tech.build()의 원장 집계 + company_yearly_metrics(R&D비·매출) +
companies(설립일 등)를 입력받아 기업별 기술력 파생컬럼을 계산한다.
비율/추세는 재무 축과 동일한 finance_utils 방어 함수를 재사용한다(팀원 A 공유 자산).

구조는 features_finance.py와 동일: compute_features(순수 계산) + dev_loader/DB 러너.
절대 임계값·정규화·스코어링은 여기서 하지 않는다(scoring_tech.py 단계).

설계 메모:
- 특허 '첫출원일'이 '설립일'보다 앞서는 기업이 있음(대표자 개인 명의 특허 이력이
  법인 설립 전부터 존재 → 예: 695는 설립 17년 전 출원). 첫특허_업력은 음수를 0으로
  clip한다("설립 즉시 IP 보유"로 간주). 원값 왜곡 방지.
- R&D집약도는 최근연도 연구개발비/매출. 매출 0/음수는 safe_ratio가 NaN.
- 인증실체괴리_플래그: 핵심인증(이노비즈/메인비즈/벤처) 보유인데 실체(등록특허·국가
  R&D)가 전무한 기업. 절대 0 기준(백분위 아님) — 소표본에서 안정적이고 해석 명확.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from finance_utils import safe_ratio, slope

KEY = "company_id"  # 원장/정규화 테이블 조인키(영문)

# yearly_metrics 컬럼명(company_yearly_metrics.yaml)
REVENUE = "revenue_thousand_krw"
RND = "rnd_expense_thousand_krw"


def _ratio_by_year(yearly: pd.DataFrame, num: str, den: str) -> pd.DataFrame:
    """(company_id × year) num/den 비율 wide. safe_ratio로 분모 0/음수 방어."""
    num_w = yearly.pivot_table(index=KEY, columns="year", values=num, aggfunc="first")
    den_w = yearly.pivot_table(index=KEY, columns="year", values=den, aggfunc="first")
    years = sorted(c for c in num_w.columns if c in den_w.columns)
    return pd.DataFrame(
        {y: safe_ratio(num_w[y], den_w[y]) for y in years}, index=num_w.index
    )


def _years_between(later: pd.Series, earlier: pd.Series) -> pd.Series:
    """두 날짜 Series의 간격(년). 결측은 NaN."""
    a = pd.to_datetime(later, errors="coerce")
    b = pd.to_datetime(earlier, errors="coerce")
    return (a - b).dt.days / 365.25


def compute_features(agg: pd.DataFrame, yearly: pd.DataFrame,
                     companies: pd.DataFrame, verbose: bool = True) -> pd.DataFrame:
    """원장 집계 + 연도지표 + 기업개요 → 기술력 파생컬럼."""
    out = pd.DataFrame({KEY: agg[KEY].values})
    a = agg.set_index(KEY)
    out = out.set_index(KEY)

    # ===================== 축4 R&D·특허 =====================
    # R&D 집약도 = 연구개발비 / 매출 (최근연도) + 5개년 추세
    rnd_intensity = _ratio_by_year(yearly, RND, REVENUE)
    if not rnd_intensity.empty:
        latest = rnd_intensity.ffill(axis=1).iloc[:, -1]  # 행별 최근 유효값
        out["R&D집약도"] = latest.reindex(out.index)
        out["R&D집약도추세"] = rnd_intensity.reindex(out.index).apply(
            lambda r: slope(r.to_numpy()), axis=1)
    else:
        out["R&D집약도"] = np.nan
        out["R&D집약도추세"] = np.nan

    # 특허 출원/등록/전환율
    out["특허출원_건수"] = a["특허출원_건수"]
    out["특허등록_건수"] = a["특허등록_건수"]
    out["특허등록전환율"] = safe_ratio(a["특허등록_건수"], a["특허출원_건수"])  # 출원 0 → NaN

    # 첫특허 업력: 첫 출원이 설립 후 몇 년째. 음수(설립 전 출원)는 0으로 clip.
    comp = companies.set_index(KEY)
    first_patent_age = _years_between(a["특허_첫출원일"], comp["founded_date"].reindex(a.index))
    out["첫특허_업력"] = first_patent_age.clip(lower=0).reindex(out.index)

    # ===================== 축6 NTIS =====================
    out["NTIS주관_과제수"] = a["NTIS주관_과제수"]
    out["NTIS주관_정부연구비"] = a["NTIS주관_정부연구비"]   # 단위 원
    out["NTIS주관_부처다양성"] = a["NTIS주관_부처다양성"]
    out["NTIS위탁_과제수"] = a["NTIS위탁_과제수"]
    out["산학협력_여부"] = a["산학협력_여부"]

    # ===================== 축5 인증 =====================
    out["인증_보유수"] = a["인증_보유수"]
    out["인증_핵심보유"] = a["인증_핵심보유"]
    # 인증-실체 괴리: 핵심인증 보유 AND 등록특허 0 AND 국가R&D 0 (절대 기준)
    out["인증실체괴리_플래그"] = (
        a["인증_핵심보유"]
        & (a["특허등록_건수"] == 0)
        & (a["NTIS주관_과제수"] == 0)
    ).reindex(out.index).fillna(False)

    out = out.reset_index()
    if verbose:
        n_gap = int(out["인증실체괴리_플래그"].sum())
        print(f"[features_tech] {out.shape[0]}개 기업 × {out.shape[1]}컬럼 "
              f"/ 인증-실체 괴리 플래그: {n_gap}곳")
    return out


def report(feat: pd.DataFrame) -> None:
    print("\n[결측 개수]")
    print(feat.drop(columns=[KEY]).isna().sum().to_string())
    print("\n[주요 파생값]")
    cols = [KEY, "R&D집약도", "특허등록전환율", "첫특허_업력",
            "NTIS주관_과제수", "인증_보유수", "인증실체괴리_플래그"]
    with pd.option_context("display.width", 200):
        print(feat[cols].round(3).to_string(index=False))


def main() -> None:
    ap = argparse.ArgumentParser(description="기술력 3축 파생컬럼 산출")
    ap.add_argument("--source", choices=["dev", "db"], default="dev",
                    help="dev=샘플 엑셀(dev_loader) / db=Postgres")
    args = ap.parse_args()

    import aggregate_tech
    if args.source == "dev":
        from dev_loader import load_tables
        tables = load_tables()
    else:
        raise SystemExit("db 소스는 팀원 C 스키마 확정 후 연결 (features_finance --source db 패턴)")

    agg = aggregate_tech.build(tables)
    feat = compute_features(agg, tables["company_yearly_metrics"], tables["companies"])
    report(feat)


if __name__ == "__main__":
    main()
