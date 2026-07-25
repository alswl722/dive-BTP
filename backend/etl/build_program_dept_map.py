"""사업명 기준 구코드(2022~23) → 신코드(2024) 부서 매핑 생성.

배경 (docs/축9_설계노트.md 관련, concurrent-support.ts):
    2024년 부산TP 사업코드 체계가 개편됐다(예 B1_311 → B1_1_3). `deptKey()`는
    사업코드 접두사로 "부서/사업군"을 추정하는데, 연도가 다르면 접두사 자체가
    달라 "동시 수혜" 판정에서 구-신 연도 간 비교를 통째로 포기하고 있었다
    (concurrent-support.ts의 deptComparable=false).

    구 접두사→신 접두사를 그대로 이어붙이면 틀린다 — 실측 결과 구 접두사 하나가
    여러 신 부서로 흩어지는 경우가 29개 중 7개(24%, 예: 구 A1 소속 사업들이
    신 A2로도 신 B4로도 감)라 **부서 단위가 아니라 개별 사업명 단위로 매핑**해야
    한다. 반대로 사업명은 코드가 바뀌어도 그대로 유지되는 경우가 대부분이라
    (실측 76.3%), 이름을 앵커로 구코드 사업의 "2024년 기준 캐노니컬 부서"를
    역산할 수 있다.

    ⚠️ 이건 "부서" 매핑이 아니라 "사업(프로그램)" 매핑이다 — 사업명이 같으면
    "같은 사업이 코드만 바뀐 것"이고, 그 사업의 2024년 코드에서 부서를 뽑아
    구코드 사업에도 적용하는 방식. 부서 접두사끼리 직접 연결하지 않는다.

정확매칭만 자동 채택, 근접매칭(오타·특수문자 수준)은 사람이 확인할 수 있게
별도 출력한다 — 오매칭으로 "동시 수혜 아닌데 동시 수혜"로 오판정하는 리스크 방지.

입력: support_programs.parquet(있으면) 또는 --btp xlsx 직접 파싱.
출력: frontend/lib/data/program-dept-map.json — {정규화된사업명: 캐노니컬부서}

사용법:
    python build_program_dept_map.py                       # parquet 우선
    python build_program_dept_map.py --btp path/to/btp.xlsx  # xlsx 직접
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent / "data"
SUPPORT_PROGRAMS_PARQUET = DATA_DIR / "support_programs.parquet"
OUT_PATH = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "data" / "program-dept-map.json"

BTP_SHEETS = ["2022_사업목록", "2023_사업목록", "2024_사업목록"]
CANONICAL_YEAR = 2024
CLOSE_MATCH_CUTOFF = 0.8


def norm_name(s) -> str:
    """사업명 정규화 — 공백·괄호·하이픈·언더스코어·쉼표·가운뎃점 제거, 대소문자·특수문자 통일.

    2024 재편 전후로 "지역기업 성장사다리 지원사업" ↔ "지역기업성장사다리지원사업"처럼
    공백만 다르거나, "R&D"↔"R＆D", "HIVE"↔"Hive", "㈜"↔"(주)", "안전·편의"↔"안전편의"처럼
    표기 폭·대소문자·기호만 다른 경우가 실측 12건 중 11건이었다(나머지 1건은 진짜 다른
    사업이라 정규화로 지우면 안 됨 — "신뢰성기술개발" vs "신뢰성기반구축").
    여기 추가하는 규칙은 **순수 표기 변이만** — 의미가 다른 단어는 절대 지우지 않는다.
    """
    s = str(s).strip().casefold()
    s = re.sub(r"[\s()\-_,·]", "", s)
    s = s.replace("&", "＆").replace("㈜", "주").replace("(주)", "주")
    return s


def dept_key(code: str) -> str | None:
    """사업코드 → 부서 접두사. frontend/lib/concurrent-support.ts의 deptKey()와 동일 규칙
    (알파벳+숫자 1회, 예 'B1_1_3'→'B1', 'B1_311'→'B1')."""
    if not code or pd.isna(code):
        return None
    m = re.match(r"^([A-Za-z]+\d*)", str(code).strip())
    return m.group(1).upper() if m else None


def load_programs(btp_path: str | None) -> pd.DataFrame:
    if btp_path:
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from parsers import parse_simple_sheet

        frames = []
        for sh in BTP_SHEETS:
            year = int(sh[:4])
            d = parse_simple_sheet(btp_path, sh, 2)
            d["year"] = year
            d = d.rename(columns={"코드": "program_code", "부산TP 예산서의 사업명": "program_name"})
            frames.append(d[["year", "program_code", "program_name"]])
        return pd.concat(frames, ignore_index=True)

    if not SUPPORT_PROGRAMS_PARQUET.exists():
        raise SystemExit(
            f"입력 없음: {SUPPORT_PROGRAMS_PARQUET}\n"
            "  → build_master_table.py를 먼저 실행하거나 --btp <xlsx경로>를 지정하세요."
        )
    return pd.read_parquet(SUPPORT_PROGRAMS_PARQUET)[["year", "program_code", "program_name"]]


def build(programs: pd.DataFrame) -> tuple[dict[str, str], list[dict]]:
    """정규화된 사업명 → 캐노니컬(2024) 부서 매핑 + 검토용 근접매칭 목록."""
    programs = programs.dropna(subset=["program_code", "program_name"])

    new_rows = programs[programs["year"] == CANONICAL_YEAR]
    old_rows = programs[programs["year"] < CANONICAL_YEAR]

    # 2024 사업명(정규화) → 부서. 같은 이름이 2024 안에서 중복되면 첫 값 사용(드묾).
    new_by_name: dict[str, str] = {}
    for _, r in new_rows.iterrows():
        key = norm_name(r["program_name"])
        dept = dept_key(r["program_code"])
        if dept and key not in new_by_name:
            new_by_name[key] = dept

    old_names = {norm_name(n) for n in old_rows["program_name"].dropna().unique()}

    exact = {k: v for k, v in new_by_name.items() if k in old_names}

    # 근접매칭은 사람이 확인하라고 별도 목록으로만 낸다 — 자동 채택 안 함(오매칭 방지).
    unmatched_2024 = set(new_by_name) - set(exact)
    review: list[dict] = []
    for k in sorted(unmatched_2024):
        candidates = difflib.get_close_matches(k, old_names, n=1, cutoff=CLOSE_MATCH_CUTOFF)
        if candidates:
            review.append({
                "새_사업명_정규화": k,
                "구_사업명_후보": candidates[0],
                "유사도": round(difflib.SequenceMatcher(None, k, candidates[0]).ratio(), 3),
                "캐노니컬_부서": new_by_name[k],
            })

    return exact, review


def main() -> None:
    ap = argparse.ArgumentParser(description="사업명 기준 구→신 부서 매핑 생성 (읽기 전용)")
    ap.add_argument("--btp", default=None, help="부산TP 사업기업목록 xlsx 경로(생략 시 parquet 사용)")
    args = ap.parse_args()

    programs = load_programs(args.btp)
    total_2024 = int((programs["year"] == CANONICAL_YEAR).sum())
    exact, review = build(programs)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"_comment": "build_program_dept_map.py 자동생성 — 직접 수정 금지. "
                                 "사업명(정규화) → 2024년 기준 캐노니컬 부서 접두사.",
                    "_generated_from_year": CANONICAL_YEAR,
                    "map": exact}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"2024 사업 {total_2024}개 중 정확매칭 {len(exact)}개 ({len(exact) / total_2024 * 100:.1f}%) "
          f"→ {OUT_PATH}")
    if review:
        print(f"\n⚠️ 근접매칭 {len(review)}건(자동 채택 안 함, 팀 확인 필요):")
        for r in review:
            print(f"  {r['새_사업명_정규화']!r} ≈ {r['구_사업명_후보']!r} "
                  f"(유사도 {r['유사도']}, 부서 {r['캐노니컬_부서']})")


if __name__ == "__main__":
    main()
