"""기술 도메인 매칭률 검증 — 본선 데이터 적재 직후 1회 실행.

용도:
    config/tech_domain.yaml 의 키워드 매핑이 실데이터(NTIS 과학기술표준분류명)를
    얼마나 커버하는지 30초 안에 점검한다. 출력을 보고 사람이 yaml에 분류명을 보강한다.

    ⚠️ 읽기 전용 — parquet/DB에 아무것도 쓰지 않는다.

무엇을 보나:
    1) NTIS 커버리지 — 전체 기업 중 NTIS 표준분류로 도메인이 잡히는 비율
       (표준분류 → KSIC추정 → 미상 3단 폴백 분포). NTIS 없는 기업이 많으면
       도메인이 KSIC 추정에 의존하게 되므로 사전에 규모를 안다.
    2) 미매칭 분류명 목록 — domain_rollup 키워드에 하나도 안 걸리는 분류명.
       이게 곧 yaml에 추가해야 할 후보다(건수 많은 순).

배경:
    매칭은 domain_tech._match_keywords(부분일치)를 그대로 재사용한다 —
    프로덕션과 같은 함수를 써야 검증값이 실제 산출과 어긋나지 않는다.

사용:
    python scripts/validate_tech_mapping.py --source parquet   # 샘플 리허설(기본)
    python scripts/validate_tech_mapping.py --source db        # 본선 실데이터
    docker compose exec backend python /app/../scripts/validate_tech_mapping.py --source db

종료코드: NTIS 표준분류 보유 기업의 분류명이 하나라도 미매칭이면 1(보강 필요), 아니면 0.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Windows 콘솔(cp949)에서도 한글·기호(✓/❌/—)가 깨지지 않게 UTF-8 강제.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        pass


def _bootstrap_paths() -> None:
    """backend/etl, backend 를 sys.path에 올린다(docker /app · 로컬 겸용)."""
    for cands, probe in (
        ([Path("/app/etl"), ROOT / "backend" / "etl"], Path("domain_tech.py")),
        ([Path("/app"), ROOT / "backend"], Path("app") / "services" / "companies.py"),
    ):
        for c in cands:
            if (c / probe).exists():
                sys.path.insert(0, str(c))
                break


_bootstrap_paths()

import pandas as pd  # noqa: E402

import domain_tech as dt  # noqa: E402
from aggregate_tech import KEY, _dedup_lead  # noqa: E402

CLS_COL = "tech_classification"  # NTIS 과학기술표준분류명 (domain_tech.build 와 동일)


def load_tables(source: str) -> dict[str, pd.DataFrame]:
    """companies · ntis_lead_projects 로드. db는 SQL, 그 외는 dev_loader(parquet/샘플)."""
    if source == "db":
        import features_finance as ff

        engine = ff._engine()
        return {n: pd.read_sql_table(n, engine) for n in ("companies", "ntis_lead_projects")}
    from dev_loader import load_tables as _lt

    return _lt()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["parquet", "db"], default="parquet")
    ap.add_argument("--top", type=int, default=0, help="미매칭 목록 상위 N개만(0=전체)")
    args = ap.parse_args()

    cfg = dt.load_config()
    rollup = cfg["domain_rollup"]
    ksic_fb = cfg["ksic_fallback"]
    unknown = cfg["unknown_label"]

    tables = load_tables(args.source)
    comp = tables["companies"].set_index(KEY)
    lead = _dedup_lead(tables["ntis_lead_projects"])  # 스냅샷 중복 제거 후 과제 단위

    print("=" * 60)
    print(f"기술 도메인 매칭률 검증 — source={args.source}, 읽기 전용")
    print("=" * 60)

    # --- 1. 분류명 매칭(고유 분류명 기준) ---
    all_cls = lead[CLS_COL].dropna().astype(str).str.strip()
    all_cls = all_cls[all_cls != ""]
    vc = all_cls.value_counts()  # 분류명 → 과제 건수
    matched, unmatched = {}, {}
    for name, cnt in vc.items():
        (matched if dt._match_keywords(name, rollup) else unmatched)[name] = int(cnt)

    uniq_total = len(vc)
    rec_total = int(vc.sum())
    uniq_matched = len(matched)
    rec_matched = sum(matched.values())

    print("\n[1] 분류명 매칭률 (domain_rollup 키워드 부분일치)")
    if uniq_total == 0:
        print("  ⚠️ NTIS 분류명이 하나도 없음 — 소스/컬럼(tech_classification) 확인 필요")
    else:
        print(f"  고유 분류명 : {uniq_matched}/{uniq_total} 매칭 ({uniq_matched/uniq_total:.0%})")
        print(f"  과제 건수   : {rec_matched}/{rec_total} 매칭 ({rec_matched/rec_total:.0%})")

    # --- 2. 미매칭 분류명 목록 (yaml 보강 후보) ---
    print("\n[2] 미매칭 분류명 (tech_domain.yaml 보강 후보 · 건수 많은 순)")
    if not unmatched:
        print("  ✓ 미매칭 없음 — 모든 분류명이 롤업에 매칭됨")
    else:
        items = sorted(unmatched.items(), key=lambda x: -x[1])
        if args.top > 0:
            items = items[: args.top]
        for name, cnt in items:
            print(f"  ❌ {name}  ·  {cnt}건")
        print(f"  → 총 {len(unmatched)}개 분류명 미매칭 (과제 {sum(unmatched.values())}건)")

    # --- 3. NTIS 커버리지 (기업 단위 3단 폴백 분포) ---
    print("\n[3] NTIS 커버리지 (기업 단위 도메인 출처 분포)")
    src_counts = {"표준분류": 0, "표준분류(전부 미매칭)": 0, "KSIC추정": 0, "미상": 0}
    for cid in comp.index:
        cls = lead.loc[lead[KEY] == cid, CLS_COL].dropna().astype(str).str.strip()
        cls = [c for c in cls if c]
        if cls:
            hit = any(dt._match_keywords(c, rollup) for c in cls)
            src_counts["표준분류" if hit else "표준분류(전부 미매칭)"] += 1
        else:
            ksic = str(comp.at[cid, "ksic_code"] or "")
            src_counts["KSIC추정" if ksic_fb.get(ksic[:3], unknown) != unknown else "미상"] += 1

    n = len(comp)
    for k, v in src_counts.items():
        pct = f" ({v/n:.0%})" if n else ""
        print(f"  · {k}: {v}곳{pct}")
    ntis_cov = src_counts["표준분류"] + src_counts["표준분류(전부 미매칭)"]
    if n:
        print(f"  ─ NTIS 표준분류 보유 : {ntis_cov}/{n} ({ntis_cov/n:.0%})")

    # --- 요약 / 종료코드 ---
    print("\n" + "-" * 60)
    problems = len(unmatched) + src_counts["표준분류(전부 미매칭)"]
    if problems == 0:
        print("✓ 매칭 이상 없음")
        return 0
    print(f"⚠️ 미매칭 분류명 {len(unmatched)}개 / 분류는 있으나 롤업 실패 기업 "
          f"{src_counts['표준분류(전부 미매칭)']}곳 → tech_domain.yaml 보강 권장")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
