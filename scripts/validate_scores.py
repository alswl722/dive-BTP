"""본선 스코어링 타당성 검증 — 실데이터 적재 직후 1회 실행.

용도:
    샘플 11개 기업으로 튜닝한 KSIC_PREFIX / MIN_GROUP / 가중치가 실데이터(~1,200개)에서
    여전히 유효한지 30분 안에 판단한다. 출력을 보고 사람이 상수를 손으로 튜닝한다.

    ⚠️ 읽기 전용 — parquet/DB에 아무것도 쓰지 않는다. LLM도 호출하지 않는다.

배경(왜 필요한가):
    샘플 11개에서는 가장 큰 업종그룹(C29)이 4개라 MIN_GROUP=5에 미달 → 전원 '전체fallback'.
    즉 "업종 평균 대비 백분위"(scoring_finance.compute_scores의 within 경로)는
    지금까지 한 번도 실행된 적이 없다. 본선에서 처음 켜진다.

사용:
    # 게이트만 빠르게 (30초)
    python scripts/validate_scores.py --source db --tech off --sweep off

    # 전체 진단 (2~4분)
    python scripts/validate_scores.py --source db

    # 샘플 데이터로 리허설
    python scripts/validate_scores.py --source parquet

    # docker
    docker compose exec backend python /app/../scripts/validate_scores.py --source db

종료코드: ❌ 1건 이상이면 1, ⚠️만 있으면 0.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import re
import sys
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _bootstrap_paths() -> None:
    """backend/app, backend/etl 을 sys.path에 올린다(docker /app · 로컬 겸용)."""
    for cands, probe in (
        ([Path("/app"), ROOT / "backend"], Path("app") / "services" / "composite_score.py"),
        ([Path("/app/etl"), ROOT / "backend" / "etl"], Path("scoring_finance.py")),
    ):
        for c in cands:
            if (c / probe).exists():
                sys.path.insert(0, str(c))
                break


_bootstrap_paths()

with contextlib.suppress(ImportError):
    from dotenv import load_dotenv

    for env in (Path("/.env"), ROOT / ".env"):
        if env.exists():
            load_dotenv(env)
            break

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import scoring_finance as sf  # noqa: E402
import scoring_tech as st  # noqa: E402
import features_finance as ff  # noqa: E402
import company_view as cv  # noqa: E402
from app.services import composite_score as cs  # noqa: E402

# 기술축 원장 테이블 — backend/app/services/companies.py::_load_tech_tables 와 동일 목록.
# (앱 서비스 레이어 전체를 import하지 않기 위해 목록만 가져온다)
TECH_TABLES = ["companies", "company_yearly_metrics", "company_certifications",
               "patents", "ntis_lead_projects", "ntis_consigned_projects"]

FIN_KEY = sf.KEY          # "기업일련번호"
TECH_KEY = st.KEY         # "company_id"
PROD_PREFIX = sf.KSIC_PREFIX  # 원복 검증용 (프로덕션 기본값)


# ============================================================
# 유틸
# ============================================================
class Findings:
    """❌/⚠️ 누적 — 마지막 요약과 종료코드에 쓴다."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warns: list[str] = []

    def err(self, msg: str) -> None:
        self.errors.append(msg)
        print(f"  ❌ {msg}")

    def warn(self, msg: str) -> None:
        self.warns.append(msg)
        print(f"  ⚠️ {msg}")

    def ok(self, msg: str) -> None:
        print(f"  ✓ {msg}")


@contextmanager
def _patched(mod, **kw):
    """모듈 레벨 상수를 임시 교체. compute_scores가 전역을 런타임에 읽으므로 그대로 먹는다.

    프로덕션 코드 수정 0줄로 KSIC_PREFIX 민감도를 재는 유일한 방법.
    """
    old = {}
    for k in kw:
        assert hasattr(mod, k), f"{mod.__name__}에 '{k}' 상수가 없다 — 이름이 바뀌었는지 확인"
        old[k] = getattr(mod, k)
    try:
        for k, v in kw.items():
            setattr(mod, k, v)
        yield
    finally:
        for k, v in old.items():
            setattr(mod, k, v)


def _spearman(a: pd.Series, b: pd.Series) -> tuple[float, int]:
    """Spearman 순위상관 → (rho, n).

    ⚠️ scipy 미설치 환경이라 pd.corr(method="spearman")은 ModuleNotFoundError로 죽는다.
       랭크 후 Pearson은 수학적으로 동일하고 의존성이 없다.
    """
    both = pd.concat([a, b], axis=1).dropna()
    if len(both) < 3:
        return float("nan"), len(both)
    x, y = both.iloc[:, 0], both.iloc[:, 1]
    return float(x.rank().corr(y.rank())), len(both)


def _pct(n: float, d: float) -> float:
    return 100.0 * n / d if d else float("nan")


def _head(title: str) -> None:
    print(f"\n{'─' * 72}\n{title}\n{'─' * 72}")


@contextmanager
def _quiet():
    """compute_scores가 쏟는 ⚠️ stdout을 삼킨다(sweep에서 동일 경고 2회 반복 방지)."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        yield buf


# ============================================================
# 로드
# ============================================================
def load_finance(source: str):
    """(feat, master, ksic) — scoring_finance의 로더를 그대로 쓴다."""
    feat, master = sf.load_inputs(source)
    ksic = sf._align_ksic(feat, master)
    return feat, master, ksic


def load_tech_tables(source: str, mode: str):
    """기술축 원장 dict. 실패 시 None."""
    if mode == "off":
        return None
    try:
        if source == "db":
            engine = ff._engine()
            return {n: pd.read_sql_table(n, engine) for n in TECH_TABLES}
        from dev_loader import load_tables
        return load_tables()
    except Exception as e:  # noqa: BLE001 — 진단 스크립트는 기술축 없이도 계속 간다
        print(f"  ⚠️ 기술축 원장 로드 실패 → 기술 진단 SKIP: {e}")
        return None


def load_tech_scores(tech_tables) -> pd.DataFrame | None:
    """company_view._prepare_tech_batch 재사용 → DataFrame.

    체인(aggregate_tech→features_tech→scoring_tech)을 복사하지 않는 이유:
    본선 당일 company_view가 바뀌면 검증 스크립트가 프로덕션과 다른 값을 검증하게 된다.
    """
    if not tech_tables:
        return None
    by_id = cv._prepare_tech_batch(tech_tables)
    if not by_id:
        return None
    return (pd.DataFrame.from_dict(by_id, orient="index")
            .rename_axis(TECH_KEY).reset_index())


def load_axis8(mode: str, source: str) -> dict[int, float | None]:
    """정합성(축8) 점수. off면 빈 dict.

    ⚠️ LLM 호출 금지 — 캐시만 읽는다.
    """
    if mode == "off" or source != "db":
        return {}
    try:
        engine = ff._engine()
        cache = pd.read_sql_table("axis8_llm_cache", engine)
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ axis8_llm_cache 로드 실패 → 정합성 축 제외: {e}")
        return {}
    out: dict[int, float | None] = {}
    for cid, grp in cache.groupby("company_id"):
        judgments = grp.to_dict("records")
        summary = cv._summarize_business_fit(judgments, int(cid))
        out[int(cid)] = summary.get("score") if summary else None
    return out


# ============================================================
# [A] 게이트
# ============================================================
def gate_metric_hints(master: pd.DataFrame, f: Findings) -> bool:
    """METRIC_HINTS 9개 지표 × 연도 매칭. 매칭 0인 지표가 있으면 즉시 중단."""
    _head("[A1] METRIC_HINTS 컬럼 매칭 — 가장 위험한 단일 실패 지점")
    df = ff.norm_cols(master)
    fatal = False
    for name, hint in ff.METRIC_HINTS.items():
        ycols = ff.find_year_cols(df, hint)
        years = sorted(ycols)
        if not years:
            f.err(f"{name:14s} → 매칭 없음. 관련 파생컬럼 전멸 → 축 점수가 통째로 NaN")
            fatal = True
        elif len(years) < 2:
            f.warn(f"{name:14s} → {years} (1개년) — CAGR·추세 계열 전부 NaN")
        elif name == "매출액" and len(years) < 3:
            f.warn(f"{name:14s} → {years} (2개년) — 매출_성장가속도는 3개년 필요")
        else:
            f.ok(f"{name:14s} → {years[0]}~{years[-1]} ({len(years)}개년)")
    if fatal:
        print("\n❌ 컬럼 매핑이 깨졌다. features_finance.py:42 METRIC_HINTS를 "
              "실데이터 컬럼명에 맞게 고친 뒤 재실행하라.")
    return not fatal


def gate_ksic_format(ksic: pd.Series, f: Findings) -> None:
    """KSIC 포맷 매칭률. 실패해도 중단하지 않는다(전체 백분위는 여전히 유효한 스코어)."""
    _head("[A2] KSIC 포맷 — 업종내 백분위가 켜지는지의 전제")
    n = len(ksic)
    grp = ksic.astype(str).str.strip().str.upper().str[:sf.KSIC_PREFIX]
    grp = grp.where(ksic.notna() & (grp != ""), "__NA__")
    na = int((grp == "__NA__").sum())
    ok = int(grp[grp != "__NA__"].str.match(sf.KSIC_PATTERN, na=False).sum())
    rate = _pct(ok, n)

    print(f"  전체 {n}건 · 패턴({sf.KSIC_PATTERN}) 통과 {ok}건 ({rate:.1f}%) · 결측 {na}건")
    bad = grp[(grp != "__NA__") & ~grp.str.match(sf.KSIC_PATTERN, na=False)]
    if len(bad):
        print(f"  비정상 포맷 예시: {list(bad.unique()[:5])}")

    if rate < 70:
        f.err(f"KSIC 패턴 통과율 {rate:.1f}% — 다수가 __NA__로 강등, 업종내 백분위가 소수 특권")
    elif rate < 95:
        f.warn(f"KSIC 패턴 통과율 {rate:.1f}% — 그룹 스킴 혼재 신호(연도별 코드 포맷 확인)")
    else:
        f.ok(f"KSIC 패턴 통과율 {rate:.1f}%")

    na_rate = _pct(na, n)
    if na_rate > 30:
        f.err(f"업종코드 결측 {na_rate:.1f}% — '동종업계 상위 X%' 서사 자체가 붕괴")
    elif na_rate > 10:
        f.warn(f"업종코드 결측 {na_rate:.1f}% — 이들은 다른 기준(전체)으로 채점됨")


# ============================================================
# variant 실행
# ============================================================
def run_variant(prefix: int, feat, ksic, tech_tables, axis8, cfg, quiet: bool = False):
    """주어진 KSIC_PREFIX로 재무·기술·종합점수를 산출 → (fin, tech, comp)."""
    ctx = _quiet() if quiet else contextlib.nullcontext()
    with _patched(sf, KSIC_PREFIX=prefix), _patched(st, KSIC_PREFIX=prefix), ctx:
        fin = sf.compute_scores(feat, ksic)
        tech = load_tech_scores(tech_tables)
    comp = build_composite(fin, tech, axis8, cfg)
    return fin, tech, comp


def build_composite(fin: pd.DataFrame, tech: pd.DataFrame | None,
                    axis8: dict, cfg: dict) -> pd.DataFrame:
    """compute_composite_scores_batch 재사용 → 종합점수 DataFrame.

    NaN→None 변환은 company_view.clean을 그대로 쓴다. compute_composite_score는
    `is not None`으로 유효축을 판정하므로 NaN을 넘기면 유효축으로 오인한다.
    """
    tmap: dict[int, dict] = {}
    if tech is not None:
        tmap = {int(r[TECH_KEY]): r for r in tech.to_dict("records")}

    axis_scores: dict[int, dict[str, float | None]] = {}
    for row in fin.to_dict("records"):
        cid = int(row[FIN_KEY])
        t = tmap.get(cid)
        axis_scores[cid] = {
            **{a: cv.clean(row.get(f"{a}점수")) for a in sf.AXES},
            "R&D특허": cv.clean(t.get("R&D특허점수")) if t else None,
            "NTIS": cv.clean(t.get("NTIS점수")) if t else None,
            "정합성": axis8.get(cid),
        }

    batch = cs.compute_composite_scores_batch(axis_scores, cfg)
    basis = dict(zip(fin[FIN_KEY].astype(int), fin["백분위기준"]))
    return pd.DataFrame([{
        "company_id": cid,
        "score": r.score,
        "raw": r.raw_weighted_average,
        "lowest_axis": r.lowest_axis,
        "valid_ratio": r.valid_axis_ratio,
        "백분위기준": basis.get(cid),
    } for cid, r in batch.items()])


# ============================================================
# [B] 분포 진단
# ============================================================
def diag_groups(fin: pd.DataFrame, f: Findings) -> None:
    _head("[B1] 업종 그룹 크기 — MIN_GROUP 통과 여부가 업종내 백분위를 켠다")
    grp = fin["업종그룹"]
    sizes = grp.value_counts()
    n = len(fin)
    small = int(sizes[sizes < sf.MIN_GROUP].sum())
    small_rate = _pct(small, n)

    print(f"  그룹 수 {len(sizes)}개 · KSIC_PREFIX={sf.KSIC_PREFIX} · MIN_GROUP={sf.MIN_GROUP}")
    print(f"  MIN_GROUP 미달 그룹 소속 기업: {small}/{n} ({small_rate:.1f}%)")
    print("\n  상위 10개 그룹:")
    print(sizes.head(10).to_string().replace("\n", "\n    "))

    if small_rate > 40:
        f.err(f"MIN_GROUP 미달 소속 {small_rate:.1f}% — 업종내 채점이 소수파. MIN_GROUP 5→3 검토")
    elif small_rate > 20:
        f.warn(f"MIN_GROUP 미달 소속 {small_rate:.1f}% — 업종 쏠림 의심")
    else:
        f.ok(f"MIN_GROUP 미달 소속 {small_rate:.1f}%")

    if len(sizes):
        top_rate = _pct(int(sizes.iloc[0]), n)
        if top_rate > 30:
            f.warn(f"최대 그룹 '{sizes.index[0]}'이 전체의 {top_rate:.1f}% — "
                   "그 그룹 내부 백분위는 사실상 전체 백분위")

    print("\n  백분위기준 분포:")
    print(fin["백분위기준"].value_counts().to_string().replace("\n", "\n    "))


def diag_axis_nan(fin: pd.DataFrame, f: Findings) -> None:
    _head("[B2] 재무 축별 NaN — MIN_AXIS_RATIO 가드에 걸리면 축이 통째로 사라진다")
    n = len(fin)
    # 축별 소속 pct_ 컬럼 수 → 유효컬럼수 중앙값 기대치
    members = {a: sum(1 for _, (ax, _) in sf.SCORE_COLS.items() if ax == a) for a in sf.AXES}
    for a in sf.AXES:
        col = f"{a}점수"
        if col not in fin.columns:
            f.err(f"{a} 점수 컬럼 없음 — scoring_finance 출력 스키마 변경 의심")
            continue
        nan_rate = _pct(int(fin[col].isna().sum()), n)
        vcol = f"유효컬럼수_{a}"
        vmed = float(fin[vcol].median()) if vcol in fin.columns else float("nan")
        print(f"  {a:5s} NaN {nan_rate:5.1f}%  유효컬럼수 중앙값 {vmed:.0f}/{members[a]}")
        if nan_rate > 30:
            f.err(f"{a} NaN {nan_rate:.1f}% — 1/3이 미채점. 축을 화면에서 내릴지 결정 필요")
        elif nan_rate > 15:
            f.warn(f"{a} NaN {nan_rate:.1f}% — 종합점수 유효축 비율을 잠식")
        if a == "효율성" and nan_rate > 10:
            f.warn("효율성은 지표가 총자산회전율 1개뿐 — NaN은 곧 원값 결측")

    # 결측 주범 파생컬럼
    pct_cols = [c for c in fin.columns if c.startswith("pct_")]
    if pct_cols:
        miss = (fin[pct_cols].isna().mean() * 100).sort_values(ascending=False)
        worst = miss[miss > 50]
        if len(worst):
            print("\n  결측률 50% 초과 파생컬럼 (상위 5):")
            print(worst.head(5).round(1).to_string().replace("\n", "\n    "))
            f.warn(f"결측률 50% 초과 파생컬럼 {len(worst)}개 — 축 점수의 근거가 얇다")


def diag_tech(tech: pd.DataFrame | None, f: Findings) -> None:
    _head("[B2-tech] 기술 축별 NaN  ※ 유환 전달용")
    if tech is None:
        print("  ⏭️  기술축 미산출 — SKIP (종합점수는 재무 단독으로 계산됨)")
        return
    n = len(tech)
    for a in st.AXES:
        col = f"{a}점수"
        if col not in tech.columns:
            f.warn(f"기술축 '{col}' 컬럼 없음")
            continue
        nan_rate = _pct(int(tech[col].isna().sum()), n)
        print(f"  {a:8s} NaN {nan_rate:5.1f}%")
        if nan_rate > 40:
            f.warn(f"기술축 {a} NaN {nan_rate:.1f}% — scoring_tech에는 MIN_AXIS_RATIO 가드가 "
                   "없어 1개 컬럼만 살아도 점수가 난다. 이 수치는 컬럼이 통째로 비었다는 뜻")


def diag_tech_ksic_divergence(fin: pd.DataFrame, tech: pd.DataFrame | None, f: Findings) -> None:
    """scoring_tech에는 KSIC_PATTERN 가드가 없어 finance와 다른 기준으로 채점될 수 있다."""
    _head("[B2'] finance/tech 백분위기준 불일치  ※ 유환 전달용")
    if tech is None or "백분위기준" not in tech.columns:
        print("  ⏭️  기술축 미산출 — SKIP")
        return
    fb = fin[[FIN_KEY, "백분위기준"]].rename(columns={FIN_KEY: "cid", "백분위기준": "fin"})
    tb = tech[[TECH_KEY, "백분위기준"]].rename(columns={TECH_KEY: "cid", "백분위기준": "tech"})
    fb["cid"] = fb["cid"].astype(int)
    tb["cid"] = tb["cid"].astype(int)
    m = fb.merge(tb, on="cid", how="inner")
    if m.empty:
        print("  ⏭️  교집합 없음 — SKIP")
        return
    diverge = m[(m["tech"] == "업종내") & (m["fin"] == "전체fallback")]
    rate = _pct(len(diverge), len(m))
    print(f"  비교 대상 {len(m)}건 · tech=업종내 & finance=전체fallback: {len(diverge)}건 ({rate:.1f}%)")
    if len(diverge):
        print(f"  샘플 company_id: {list(diverge['cid'].head(5))}")
        msg = (f"두 축이 서로 다른 기준으로 채점된 뒤 종합점수 하나로 합쳐진다 ({rate:.1f}%). "
               "scoring_tech.py에 KSIC_PATTERN 가드 이식 필요")
        f.err(msg) if rate > 5 else f.warn(msg)
    else:
        f.ok("finance/tech 백분위기준 일치")


def diag_composite(comp: pd.DataFrame, f: Findings) -> None:
    _head("[B3] 종합점수 분포 — 변별력이 없으면 스코어카드의 존재 이유가 사라진다")
    s = comp["score"].dropna()
    n_all = len(comp)
    none_rate = _pct(n_all - len(s), n_all)

    if s.empty:
        f.err("종합점수가 전부 None — 유효축 비율 가드에 전원 탈락")
        return

    print(s.describe().round(1).to_string().replace("\n", "\n    "))

    bins = list(range(0, 101, 10))
    hist = pd.cut(s, bins=bins, include_lowest=True).value_counts().sort_index()
    print("\n  10점 단위 도수:")
    for iv, c in hist.items():
        bar = "█" * int(40 * c / max(1, hist.max()))
        print(f"    {int(iv.left):3d}~{int(iv.right):3d}  {c:5d}  {bar}")

    std = float(s.std())
    mid_rate = _pct(int(((s >= 40) & (s <= 60)).sum()), len(s))
    mean = float(s.mean())
    print(f"\n  std={std:.1f} · 40~60 밀집도={mid_rate:.1f}% · 평균={mean:.1f} · 미산출={none_rate:.1f}%")

    if std < 5:
        f.err(f"종합점수 std {std:.1f} — 사실상 전원 동점. 줄을 세울 수 없다")
    elif std < 8:
        f.warn(f"종합점수 std {std:.1f} — 변별력 부족(기대 12~18). cap_margin 축소 / 가중치 재조정 검토")
    else:
        f.ok(f"종합점수 std {std:.1f}")

    if mid_rate > 75:
        f.err(f"40~60 밀집도 {mid_rate:.1f}% — 상하위 변별 불가")
    elif mid_rate > 60:
        f.warn(f"40~60 밀집도 {mid_rate:.1f}% — 과밀(백분위 평균의 자연값은 약 55%)")

    if not (42 <= mean <= 55):
        f.warn(f"평균 {mean:.1f} — 백분위 평균은 구조적으로 50 근처여야 한다. 결측/fallback 편향 의심")

    if none_rate > 10:
        f.warn(f"종합점수 미산출 {none_rate:.1f}% — 유효축 가드 탈락 기업이 많다")

    # 캡 발동
    capped = comp.dropna(subset=["score", "raw"])
    if len(capped):
        cap_rate = _pct(int((capped["score"] < capped["raw"]).sum()), len(capped))
        print(f"  캡 발동률: {cap_rate:.1f}%")
        if cap_rate > 80:
            f.warn(f"캡 발동 {cap_rate:.1f}% — 종합점수≈최저축+cap_margin이 되어 가중치가 무의미. cap_margin 상향")
        elif cap_rate < 15:
            f.warn(f"캡 발동 {cap_rate:.1f}% — 캡이 사실상 죽음. 축 어긋남 방어 실패. cap_margin 하향")

    if comp["lowest_axis"].notna().any():
        lv = comp["lowest_axis"].value_counts()
        print("\n  최저축 분포:")
        print(lv.to_string().replace("\n", "\n    "))
        top_rate = _pct(int(lv.iloc[0]), int(lv.sum()))
        if top_rate > 50:
            f.warn(f"'{lv.index[0]}'이 최저축의 {top_rate:.1f}% — 그 축만 체계적으로 낮다(스케일 문제 의심)")


def diag_basis_bias(comp: pd.DataFrame, f: Findings) -> None:
    _head("[B4] 백분위기준별 점수 편향 — 두 집단이 같은 화면에 섞여 있다")
    d = comp.dropna(subset=["score"])
    g = d.groupby("백분위기준")["score"].agg(["count", "mean"])
    if len(g) < 2:
        print(f"  단일 기준({list(g.index)}) — 편향 비교 불가")
        return
    print(g.round(1).to_string().replace("\n", "\n    "))

    try:
        m_in = float(g.loc["업종내", "mean"])
        m_fb = float(g.loc["전체fallback", "mean"])
        n_fb = int(g.loc["전체fallback", "count"])
    except KeyError:
        return
    gap = abs(m_in - m_fb)
    print(f"\n  |업종내 − 전체fallback| = {gap:.1f}점")
    if n_fb < 30:
        f.warn(f"fallback 집단 n={n_fb} — 표본 부족, 차이 수치를 신뢰하지 말 것")
    elif gap >= 10:
        f.err(f"집단 간 {gap:.1f}점 차 — 어느 업종에 속했느냐가 점수를 정한다. 심사 근거로 사용 불가")
    elif gap >= 5:
        f.warn(f"집단 간 {gap:.1f}점 차 — 공정성 결함(두 집단 다 백분위 기반이라 기대차는 0)")
    else:
        f.ok(f"집단 간 {gap:.1f}점 차")


# ============================================================
# [C] KSIC_PREFIX 민감도
# ============================================================
def compare_variants(v: dict, top_n: int, f: Findings) -> None:
    _head(f"[C] KSIC_PREFIX 민감도 — 3(중분류) vs 4(소분류)")
    rows = []
    for p, (fin, _tech, comp) in v.items():
        s = comp["score"].dropna()
        sizes = fin["업종그룹"].value_counts()
        small = _pct(int(sizes[sizes < sf.MIN_GROUP].sum()), len(fin))
        fb = _pct(int((fin["백분위기준"] == "전체fallback").sum()), len(fin))
        d = comp.dropna(subset=["score"])
        by = d.groupby("백분위기준")["score"].mean()
        gap = abs(by.get("업종내", np.nan) - by.get("전체fallback", np.nan))
        capped = comp.dropna(subset=["score", "raw"])
        cap = _pct(int((capped["score"] < capped["raw"]).sum()), len(capped)) if len(capped) else np.nan
        rows.append({
            "prefix": p,
            "그룹수": len(sizes),
            "MIN_GROUP미달%": round(small, 1),
            "fallback%": round(fb, 1),
            "종합점수std": round(float(s.std()), 1) if len(s) > 1 else np.nan,
            "40~60밀집%": round(_pct(int(((s >= 40) & (s <= 60)).sum()), len(s)), 1) if len(s) else np.nan,
            "집단간점수차": round(float(gap), 1) if pd.notna(gap) else np.nan,
            "캡발동%": round(cap, 1) if pd.notna(cap) else np.nan,
        })
    table = pd.DataFrame(rows).set_index("prefix")
    with pd.option_context("display.width", 200):
        print(table.to_string())

    c3, c4 = v[3][2], v[4][2]
    a = c3.set_index("company_id")["score"]
    b = c4.set_index("company_id")["score"]
    rho, n = _spearman(a, b)
    k = min(top_n, int(a.notna().sum()), int(b.notna().sum()))  # 모집단보다 큰 N 방지
    top3 = set(c3.nlargest(k, "score")["company_id"])
    top4 = set(c4.nlargest(k, "score")["company_id"])
    overlap = len(top3 & top4)
    print(f"\n  순위상관(Spearman) = {rho:.3f} (n={n})")
    print(f"  상위 {k}위 교집합 = {overlap}/{k}"
          + (f"  (요청 {top_n} → 모집단에 맞춰 축소)" if k < top_n else "")
          + "  ※ 동점 절단 있음")

    # 꼬리 불안정 — 상관은 높은데 상위권이 흔들리는 경우를 잡는다
    both = pd.concat([a.rank(ascending=False), b.rank(ascending=False)], axis=1).dropna()
    if len(both):
        both.columns = ["rank3", "rank4"]
        both["delta"] = (both["rank3"] - both["rank4"]).abs()
        movers = both.nlargest(5, "delta")
        g3 = dict(zip(v[3][0][FIN_KEY].astype(int), v[3][0]["업종그룹"]))
        g4 = dict(zip(v[4][0][FIN_KEY].astype(int), v[4][0]["업종그룹"]))
        print("\n  순위 변동 상위 5건:")
        for cid, r in movers.iterrows():
            print(f"    {cid}: {int(r.rank3)}위 → {int(r.rank4)}위 "
                  f"(Δ{int(r.delta)})  {g3.get(int(cid))} → {g4.get(int(cid))}")

    # 결정 규칙
    print("\n  [결정]")
    gap3, gap4 = table.loc[3, "집단간점수차"], table.loc[4, "집단간점수차"]
    std3, std4 = table.loc[3, "종합점수std"], table.loc[4, "종합점수std"]
    fb3, fb4 = table.loc[3, "fallback%"], table.loc[4, "fallback%"]

    if pd.notna(rho) and rho >= 0.95:
        pick = 3 if fb3 <= fb4 else 4
        print(f"    순위상관 {rho:.3f} ≥ 0.95 → 사실상 동일한 순위. fallback 낮은 쪽 채택")
    else:
        bad3 = pd.notna(gap3) and gap3 >= 5
        bad4 = pd.notna(gap4) and gap4 >= 5
        if bad3 != bad4:
            pick = 4 if bad3 else 3
            print(f"    순위상관 {rho:.3f} < 0.95, 한쪽만 공정성 결함(집단간 ≥5점) → 그쪽 탈락")
        elif pd.notna(std3) and pd.notna(std4) and abs(std3 - std4) >= 1:
            pick = 3 if std3 > std4 else 4
            print(f"    공정성 동일 → 변별력(std) 큰 쪽 채택")
        else:
            pick = 3
            print(f"    std 차이 < 1점 → 동률. 변경 리스크 회피를 위해 현행 유지")

    print(f"\n  → 권고: KSIC_PREFIX = {pick}"
          + ("  (현행 유지, 수정 불필요)" if pick == PROD_PREFIX
             else f"  (scoring_finance.py:37 · scoring_tech.py:25 동시 수정)"))
    if pick != PROD_PREFIX:
        f.warn(f"KSIC_PREFIX를 {PROD_PREFIX} → {pick} 로 바꾸는 것을 권고")


# ============================================================
def main() -> None:
    ap = argparse.ArgumentParser(description="본선 스코어링 타당성 검증 (읽기 전용)")
    ap.add_argument("--source", choices=["parquet", "db"], default="parquet",
                    help="재무 입력 소스 (기본: parquet)")
    ap.add_argument("--tech", choices=["auto", "dev", "off"], default="auto",
                    help="기술축 산출 방식. auto=실패 시 off로 강등 (기본: auto)")
    ap.add_argument("--axis8", choices=["off", "cache"], default="off",
                    help="정합성 축 처리. cache=axis8_llm_cache 조회 (기본: off)")
    ap.add_argument("--sweep", choices=["off", "3v4"], default="3v4",
                    help="KSIC_PREFIX 민감도 비교 (기본: 3v4)")
    ap.add_argument("--top-n", type=int, default=20,
                    help="순위 교집합 비교 상위 N (기본: 20)")
    args = ap.parse_args()

    f = Findings()
    cfg = cs.load_weights()
    weights = cs._resolve_axis_weights(cfg)

    print("=" * 72)
    print("스코어 분포 검증 — 읽기 전용 (parquet/DB에 쓰지 않음)")
    print("=" * 72)
    print(f"  source={args.source}  tech={args.tech}  axis8={args.axis8}  sweep={args.sweep}")
    print(f"  프로덕션 KSIC_PREFIX={PROD_PREFIX}  MIN_GROUP={sf.MIN_GROUP}  "
          f"MIN_VALID={sf.MIN_VALID}  MIN_AXIS_RATIO={sf.MIN_AXIS_RATIO}")
    print(f"  cap_margin={cfg.get('cap_margin')}  min_valid_axis_ratio={cfg.get('min_valid_axis_ratio')}")

    feat, master, ksic = load_finance(args.source)
    tech_tables = load_tech_tables(args.source, args.tech)
    axis8 = load_axis8(args.axis8, args.source)

    if not axis8:
        fin_w = sum(w for a, w in weights.items() if a in sf.AXES)
        tech_w = sum(w for a, w in weights.items() if a in st.AXES)
        eff = fin_w + tech_w
        print(f"\n  ⚠️ 정합성(축8) 제외 — 6축 기준. 실효 가중치 "
              f"재무 {100 * fin_w / eff:.1f}% / 기술 {100 * tech_w / eff:.1f}%")
        print(f"     (프로덕션 7축: " + " / ".join(
            f"{a} {100 * w:.1f}%" for a, w in weights.items() if a == "정합성") + " 포함)")
        print("     → 종합점수 절대값은 프로덕션과 비교 불가. 분포·순위·상관 진단만 유효.")
    else:
        print(f"\n  축8 커버리지: {len([v for v in axis8.values() if v is not None])}건")

    # [A] 게이트
    if not gate_metric_hints(master, f):
        sys.exit(1)
    gate_ksic_format(ksic, f)

    # [B] 프로덕션 설정으로 진단
    fin, tech, comp = run_variant(PROD_PREFIX, feat, ksic, tech_tables, axis8, cfg)
    diag_groups(fin, f)
    diag_axis_nan(fin, f)
    diag_tech(tech, f)
    diag_tech_ksic_divergence(fin, tech, f)
    diag_composite(comp, f)
    diag_basis_bias(comp, f)

    # [C] 민감도
    if args.sweep == "3v4":
        variants = {3: (fin, tech, comp) if PROD_PREFIX == 3 else None}
        for p in (3, 4):
            if variants.get(p) is None:
                variants[p] = run_variant(p, feat, ksic, tech_tables, axis8, cfg, quiet=True)
        compare_variants(variants, args.top_n, f)

    # 원복 검증
    assert sf.KSIC_PREFIX == PROD_PREFIX, "scoring_finance.KSIC_PREFIX 원복 실패"
    assert st.KSIC_PREFIX == PROD_PREFIX, "scoring_tech.KSIC_PREFIX 원복 실패"

    # 요약
    _head("요약")
    print(f"  ❌ {len(f.errors)}건 · ⚠️ {len(f.warns)}건")
    for m in f.errors:
        print(f"    ❌ {m}")
    for m in f.warns:
        print(f"    ⚠️ {m}")
    if not f.errors and not f.warns:
        print("  ✓ 임계값 위반 없음")
    print()
    sys.exit(1 if f.errors else 0)


if __name__ == "__main__":
    main()
