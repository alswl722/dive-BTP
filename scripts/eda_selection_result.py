"""선정결과 결측 추론 진단 EDA — 실데이터 받자마자 1회 실행.

방침(합의됨):
    선정결과 결측은 축9·반복선정 랭킹·축8의 '모집단'을 정하는 민감한 값이다. 보수적으로:
    시작일/종료일에 실제 날짜면 '지원대상', '-'면 '탈락', 신호 없으면 미상 유지.
    (지원금은 탈락도 가질 수 있어 판정에서 제외 — EDA로 밝혀낸 교정.)

    ⚠️ 읽기 전용 — DB·config에 쓰지 않는다. xlsx만 읽는다. 적재 전에도 동작.
    추론 로직은 backend/etl/selection_inference.py(SSOT)를 그대로 쓴다 — ETL과 동일.

세 가지를 본다:
    1. 선정결과 값 분포·결측률   — 추론이 얼마나 필요한지
    2. 규칙 검증 (라벨 대조)      — 라벨 가리고 추론 → 실제와 대조(오분류 0이어야)
    3. 모집단 영향               — 추론이 '지원대상'을 몇 건 늘리는지(축9/랭킹 영향)

사용:
    python scripts/eda_selection_result.py                     # 샘플
    python scripts/eda_selection_result.py --btp <실데이터.xlsx>   # 본선
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for cand in (Path("/app/etl"), ROOT / "backend" / "etl"):
    if (cand / "selection_inference.py").exists():
        sys.path.insert(0, str(cand))
        break

import pandas as pd  # noqa: E402

from parsers import parse_simple_sheet  # noqa: E402
import selection_inference as si  # noqa: E402

DEFAULT_BTP = ROOT / "backend" / "etl" / "data" / "배포_샘플_부산TP__사업기업목록_26-07-06.xlsx"
SHEETS = ["2022_기업지원목록", "2023_기업지원목록", "2024_기업지원목록"]


def _head(t: str) -> None:
    print(f"\n{'─' * 72}\n{t}\n{'─' * 72}")


def main() -> None:
    ap = argparse.ArgumentParser(description="선정결과 결측 추론 진단 (읽기 전용)")
    ap.add_argument("--btp", default=str(DEFAULT_BTP))
    args = ap.parse_args()
    path = Path(args.btp)
    if not path.exists():
        sys.exit(f"❌ 파일 없음: {path}")

    frames = []
    for sh in SHEETS:
        try:
            frames.append(parse_simple_sheet(str(path), sh, 2))
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠️ 시트 스킵 {sh}: {e}")
    d = pd.concat(frames, ignore_index=True)
    n = len(d)
    print("=" * 72)
    print(f"선정결과 결측 추론 EDA — {path.name}  (지원레코드 {n}행)")
    print("=" * 72)

    # ── 1. 분포·결측 ─────────────────────────────────────────────
    _head("[1] 선정결과 값 분포 · 결측률")
    miss = int(d[si.COL_RESULT].apply(si._missing).sum())
    print(f"  선정결과 결측: {miss}/{n} ({100 * miss / n:.1f}%) → 추론 대상")
    print("\n  값 분포:")
    print(d[si.COL_RESULT].value_counts(dropna=False).to_string().replace("\n", "\n    "))

    # ── 2. 규칙 검증 (라벨 대조) ─────────────────────────────────
    _head("[2] 규칙 검증 — 라벨 가리고 추론해 실제와 대조 (오분류 0이어야)")
    fire = correct = abstain = 0
    wrong = []
    labeled = d[~d[si.COL_RESULT].apply(si._missing)]
    for _, r in labeled.iterrows():
        pred, reason = si.infer_one(None, r.get(si.COL_START), r.get(si.COL_END))
        if reason is None:
            abstain += 1
        else:
            fire += 1
            if pred == r[si.COL_RESULT]:
                correct += 1
            else:
                wrong.append((r[si.COL_RESULT], pred))
    print(f"  라벨 있는 {len(labeled)}건 중 — 규칙 발동 {fire}, 미상유지(기권) {abstain}")
    print(f"  발동 중 정확: {correct}/{fire}" + (" ✓" if correct == fire else ""))
    if wrong:
        print(f"  ⚠️ 오분류 {len(wrong)}건:")
        for t, p in wrong[:10]:
            print(f"     실제={t} 예측={p}")
    else:
        print("  ✓ 오분류 0 — 발동한 건 전부 정답")
    # 기권한 건들이 실제로 뭐였나(지원대상을 놓쳤는지 확인)
    ab_labels = [r[si.COL_RESULT] for _, r in labeled.iterrows()
                 if si.infer_one(None, r.get(si.COL_START), r.get(si.COL_END))[1] is None]
    if ab_labels:
        print("\n  기권(미상유지) 건들의 실제 라벨:")
        vc = pd.Series(ab_labels).value_counts()
        print(vc.to_string().replace("\n", "\n    "))
        if si.SELECTED in vc.index:
            print(f"  ⚠️ 지원대상 {vc[si.SELECTED]}건을 기권함 — 규칙이 실제 수혜자를 놓침(재검토)")
        else:
            print("  ✓ 기권 건에 '지원대상' 없음 — 진짜 수혜자는 안 놓침")

    # ── 3. 모집단 영향 ───────────────────────────────────────────
    _head("[3] 모집단 영향 — 추론이 '지원대상'을 몇 건 늘리나 (축9·랭킹 직결)")
    _, audit = si.infer_selection_results(d)
    if audit:
        for k, v in audit.items():
            print(f"  {k}: {v}건")
        added = audit.get("지원대상_추론", 0)
        print(f"\n  → 지원대상 모집단 {'+' if added else ''}{added}건 변동. "
              "축9 중복탐지·반복선정 랭킹·축8 대상이 그만큼 바뀜.")
    else:
        print("  선정결과 결측 없음 → 추론 발동 없음 (모집단 변동 0)")


if __name__ == "__main__":
    main()
