"""재무 축 엣지케이스 자체 테스트 (pytest 불필요 — python test_edge_cases.py).

합성 기업들로 compute_features / compute_scores의 방어 동작을 검증한다.
docs/재무축_설계노트.md '엣지케이스 대응' 섹션과 1:1 대응.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from finance_utils import slope
from features_finance import compute_features, find_year_cols
from scoring_finance import compute_scores, MIN_VALID

YEARS = [2020, 2021, 2022, 2023, 2024]
FIN = ["매출액", "영업이익손실", "매출원가", "당기순이익손실", "영업이익률",
       "자산총계", "부채총계", "자본총계", "납입자본금"]


def blank_row(cid, years=YEARS, ksic="C29199"):
    r = {"기업일련번호": cid, "KSIC코드(11차)": ksic}
    for m in FIN:
        for y in years:
            r[f"{m}_{y}"] = np.nan
    return r


def normal(cid, years=YEARS, ksic="C29199", scale=1.0):
    """정상 기업: 완만 성장·흑자·건전 재무."""
    r = blank_row(cid, years, ksic)
    for i, y in enumerate(years):
        rev = (1000 + 100 * i) * scale
        r[f"매출액_{y}"] = rev
        r[f"영업이익손실_{y}"] = rev * 0.08
        r[f"매출원가_{y}"] = rev * 0.6
        r[f"당기순이익손실_{y}"] = rev * 0.05
        r[f"영업이익률_{y}"] = 8.0
        r[f"자산총계_{y}"] = rev * 2
        r[f"부채총계_{y}"] = rev * 0.8
        r[f"자본총계_{y}"] = rev * 1.2
        r[f"납입자본금_{y}"] = 300 * scale
    return r


def build_df():
    rows = [normal(1)]                                    # C1 정상
    r = normal(2); r["자본총계_2024"] = -500; rows.append(r)  # C2 자본잠식
    r = normal(3)
    for y in YEARS: r[f"영업이익손실_{y}"] = np.nan          # C3 영업이익 전결측
    rows.append(r)
    r = normal(5)
    for y in YEARS: r[f"납입자본금_{y}"] = 0                 # C5 납입자본금 0
    rows.append(r)
    r = normal(7)                                          # C7 판관비 음수(모순)
    for y in YEARS: r[f"영업이익손실_{y}"] = r[f"매출액_{y}"] * 0.5
    rows.append(r)
    r = normal(8)                                          # C8 중간연도 값 결측(2022)
    for m in FIN: r[f"{m}_2022"] = np.nan
    rows.append(r)
    r = normal(12); r["매출액_2020"] = np.nan; rows.append(r)  # C12 첫연도만 결측
    rows.append(normal(10, ksic="42500"))                  # C10 KSIC 숫자 포맷
    rows.append(normal(11, ksic=np.nan))                   # C11 KSIC 결측
    rows.append(normal(13))                                # C13 중복 ID
    rows.append(normal(13, scale=2.0))
    return pd.DataFrame(rows)


def approx(a, b, tol=1e-6):
    return a is not None and not pd.isna(a) and abs(a - b) <= tol


def main():
    ok = 0

    def check(name, cond):
        nonlocal ok
        assert cond, f"❌ {name}"
        ok += 1
        print(f"  ✅ {name}")

    # ---------- finance_utils ----------
    print("[1] finance_utils")
    check("slope 연도 x축: (2020,2022,2024) 간격 반영 → 10/년",
          approx(slope([100, 120, 140], x=[2020, 2022, 2024]), 10.0))
    check("slope x 길이 불일치 → NaN", pd.isna(slope([1, 2, 3], x=[2020, 2021])))

    # ---------- features: 매핑 ----------
    print("[2] 컬럼 매핑 (엄격 + fallback)")
    df = build_df()
    fake = df.copy()
    fake["매출액증가율_2024"] = 99.9  # 과매칭 유도용 가짜 컬럼
    m = find_year_cols(fake, "매출액")
    check("가짜 '매출액증가율_2024'가 진짜 매핑을 덮지 못함", m[2024] == "매출액_2024")
    deco = pd.DataFrame({"기업일련번호": [1], "특허등록건수(최종건수누적)_2024": [3]})
    m2 = find_year_cols(deco, "특허등록건수")
    check("장식 붙은 컬럼명은 fallback으로 살림", m2.get(2024) == "특허등록건수(최종건수누적)_2024")
    renamed = df.rename(columns={f"영업이익손실_{y}": f"영업이익_{y}" for y in YEARS})
    check("컬럼명 변형 시 매칭 0개(무단 오매칭 없음)", find_year_cols(renamed, "영업이익손실") == {})

    # ---------- features: 파생 ----------
    print("[3] compute_features 방어")
    feat = compute_features(df, verbose=False)

    def g(cid, col):
        return feat.loc[feat["기업일련번호"] == cid, col].iloc[0]

    check("중복 ID → 첫 행만 유지", int((feat["기업일련번호"] == 13).sum()) == 1)
    check("이익 전결측 → 흑자지속성 NaN (0 아님)", pd.isna(g(3, "흑자지속성")))
    check("이익 전결측 → 흑자관측연수 0", g(3, "흑자관측연수") == 0)
    check("정상 기업 흑자지속성 5", approx(g(1, "흑자지속성"), 5.0))
    check("자본잠식 → 부채비율 NaN", pd.isna(g(2, "부채비율_최근")))
    check("자본잠식 → 플래그 1", approx(g(2, "자본잠식_플래그"), 1.0))
    check("자본잠식 → 자본잠식정도 음수(의미 유지)", g(2, "자본잠식정도") < 0)
    check("납입자본금 0 → 자본잠식정도 NaN", pd.isna(g(5, "자본잠식정도")))
    check("판관비 음수 모순 → 플래그 1", approx(g(7, "데이터모순_판관비음수"), 1.0))
    check("정상 기업 → 모순 플래그 0", approx(g(1, "데이터모순_판관비음수"), 0.0))
    # CAGR 유효연도 fallback: 2020 결측 → 2021~2024(3년 span)로 계산
    expect = (1400 / 1100) ** (1 / 3) - 1
    check("첫연도 결측 → 유효연도로 CAGR 계산", approx(g(12, "매출_CAGR"), expect, 1e-9))
    # 가속도 정보부족 가드: 중간연도 결측으로 유효 전이 2개 → NaN
    check("유효 전이 <3 → 성장가속도 NaN", pd.isna(g(8, "매출_성장가속도")))
    check("정상 기업 가속도는 산출됨", not pd.isna(g(1, "매출_성장가속도")))
    # 연도 컬럼 자체가 3개(전이 2)면 가속도 NaN
    df3 = pd.DataFrame([normal(21, years=[2020, 2021, 2022]), normal(22, years=[2020, 2021, 2022])])
    feat3 = compute_features(df3, verbose=False)
    check("연도 컬럼 3개(전이2) → 가속도 NaN(창 겹침 차단)",
          feat3["매출_성장가속도"].isna().all())
    # 컬럼명 변형 전체 파이프라인: 수익성 NaN + 흑자지속성도 NaN(0 오염 아님)
    feat_r = compute_features(renamed, verbose=False)
    check("컬럼명 변형 → 영업이익률_최근 전부 NaN", feat_r["영업이익률_최근"].isna().all())
    check("컬럼명 변형 → 흑자지속성 NaN(0으로 오염되지 않음)", feat_r["흑자지속성"].isna().all())

    # ---------- scoring ----------
    print("[4] compute_scores 방어")
    ksic = df.drop_duplicates("기업일련번호")["KSIC코드(11차)"].reset_index(drop=True)
    scores = compute_scores(feat, ksic)

    def s(cid, col):
        return scores.loc[scores["기업일련번호"] == cid, col].iloc[0]

    check("KSIC 숫자 포맷 → __NA__ 강등 + 전체 fallback",
          s(10, "업종그룹") == "__NA__" and s(10, "백분위기준") == "전체fallback")
    check("KSIC 결측 → __NA__ 라벨(pandas3 대응) + 전체 fallback",
          s(11, "업종그룹") == "__NA__" and s(11, "백분위기준") == "전체fallback")
    check("유효컬럼수_* 출력", all(f"유효컬럼수_{a}" in scores.columns for a in ["성장성", "수익성", "효율성", "안정성"]))
    check("passthrough에 데이터모순·흑자관측연수 포함",
          "데이터모순_판관비음수" in scores.columns and "흑자관측연수" in scores.columns)
    # 희소 컬럼: 유효 1개 → 백분위 전체 NaN (단독 100점 방지)
    sparse = feat.copy()
    sparse["ROE추세"] = np.nan
    sparse.loc[sparse["기업일련번호"] == 1, "ROE추세"] = 0.05
    sp = compute_scores(sparse, ksic)
    check(f"희소 컬럼(유효 1 < {MIN_VALID}) → 백분위 전체 NaN", sp["pct_ROE추세"].isna().all())
    # 축 최소 유효 가드: 수익성 10개 중 3개만 유효 → 축점수 NaN
    poor = feat.copy()
    kill = ["영업이익률_최근", "순이익률_최근", "매출총이익률_최근", "ROA", "ROE", "판관비율", "수익성추세"]
    poor.loc[poor["기업일련번호"] == 1, kill] = np.nan
    pr = compute_scores(poor, ksic)
    check("축 유효 컬럼 < 절반 → 축점수 NaN(부분 데이터 점수 차단)",
          pd.isna(pr.loc[pr["기업일련번호"] == 1, "수익성점수"].iloc[0]))
    check("유효컬럼수로 사유 확인 가능",
          int(pr.loc[pr["기업일련번호"] == 1, "유효컬럼수_수익성"].iloc[0]) < 5)

    # ---------- 기업규모(대/중/소) 3단 계층 그룹핑 (docs/재무축_설계노트.md §9) ----------
    print("[5] 기업규모 3단 tier 방어")
    size_feat = pd.DataFrame({
        "기업일련번호": range(1, 21),
        "매출_CAGR": np.random.RandomState(0).uniform(-0.1, 0.3, 20),
    })
    size_ksic = pd.Series(["C29"] * 10 + ["C99"] * 10)
    # C29: 대기업 8(충분) / 소기업 2(부족) — 같은 KSIC 안에서도 규모별 표본크기가 다름
    # C99: 중기업 10(충분)
    size_size = pd.Series((["대기업"] * 8 + ["소기업"] * 2) + ["중기업"] * 10)
    size_scores = compute_scores(size_feat, size_ksic, size_size)
    basis = size_scores["백분위기준"]
    check("size 미제공 시 하위호환(기존 2단과 동일 시그니처로 호출 가능)",
          "백분위기준" in compute_scores(size_feat, size_ksic).columns)
    check("KSIC×규모 표본 충분(대기업 8명) → 업종x규모 tier 채택",
          (basis.iloc[0:8] == "업종x규모").all())
    check("같은 KSIC라도 규모별 표본 부족(소기업 2명 < MIN_GROUP) → KSIC단독으로 자동 강등",
          (basis.iloc[8:10] == "업종내").all())
    check("다른 KSIC×규모 조합(중기업 10명)도 독립적으로 업종x규모 채택",
          (basis.iloc[10:20] == "업종x규모").all())
    no_size_scores = compute_scores(size_feat, size_ksic)
    check("size 인자 없으면 전원 기존 업종내 tier(회귀 없음)",
          (no_size_scores["백분위기준"] == "업종내").all())

    print(f"\n✅ 엣지케이스 테스트 {ok}개 전부 통과")


if __name__ == "__main__":
    main()
