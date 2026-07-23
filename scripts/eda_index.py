"""eda_reports/ 하위의 meta.json 들을 훑어 INDEX.md 자동 생성.

각 EDA 스크립트가 실행 후 meta.json을 남기면(eda_viz.write_meta),
이 스크립트가 그걸 종합해 팀 공유용 마크다운 리포트를 만든다.

사용:
    python scripts/eda_index.py                     # eda_reports/INDEX.md 생성
    python scripts/eda_index.py --open              # 생성 후 파일 열기 (Windows/Mac 자동)

전체 EDA 파이프라인:
    bash scripts/run_data_pipeline.sh --eda-only    # 개별 EDA + eda_index 순차 실행
"""

from __future__ import annotations

import argparse
import os
import platform
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for cand in (Path("/app/etl"), ROOT / "backend" / "etl"):
    if (cand / "eda_viz.py").exists():
        sys.path.insert(0, str(cand))
        break

from eda_viz import REPORTS_DIR, load_all_meta  # noqa: E402


STATUS_EMOJI = {
    "good": "🟢",
    "warn": "🟡",
    "bad": "🔴",
    "info": "⚪",
}

STATUS_LABEL = {
    "good": "정상",
    "warn": "검토 필요",
    "bad": "차단 or 확인 필수",
    "info": "정보성",
}


def build_index_md(metas: list[dict]) -> str:
    """meta 리스트 → 마크다운 리포트 문자열."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # 상태별 카운트
    counts = {"good": 0, "warn": 0, "bad": 0, "info": 0}
    for m in metas:
        counts[m.get("status", "info")] = counts.get(m.get("status", "info"), 0) + 1

    # 전체 판정
    if counts["bad"]:
        overall = "🔴 NO-GO"
        overall_note = f"차단 항목 {counts['bad']}건 — 데이터 검토·정책 논의 필수"
    elif counts["warn"]:
        overall = "🟡 CONDITIONAL GO"
        overall_note = f"검토 필요 {counts['warn']}건 — 원인 파악 후 진행"
    elif counts["good"]:
        overall = "🟢 GO"
        overall_note = "모든 항목 정상 — ETL 적재·스코어링 진행 가능"
    else:
        overall = "⚪ EMPTY"
        overall_note = "EDA 결과 없음 — 스크립트를 먼저 실행하세요"

    lines: list[str] = []
    lines.append(f"# EDA 리포트")
    lines.append("")
    lines.append(f"**생성 시각**: {now}")
    lines.append(f"**총 판정**: {overall} — {overall_note}")
    lines.append("")

    # 상태 요약 표
    lines.append("## 상태 요약")
    lines.append("")
    lines.append("| 상태 | 건수 | 의미 |")
    lines.append("|---|---|---|")
    for st in ("good", "warn", "bad", "info"):
        if counts[st] > 0:
            lines.append(f"| {STATUS_EMOJI[st]} {STATUS_LABEL[st]} | {counts[st]} | — |")
    lines.append("")

    # highlights 종합 (전 항목의 highlights를 모아 상단에)
    all_highlights: list[str] = []
    for m in metas:
        for h in m.get("highlights", []):
            emoji = STATUS_EMOJI.get(m.get("status", "info"), "")
            all_highlights.append(f"- {emoji} **[{m['title']}]** {h}")
    if all_highlights:
        lines.append("## 주요 발견")
        lines.append("")
        lines.extend(all_highlights)
        lines.append("")

    # 리포트별 상세
    lines.append("## 리포트")
    lines.append("")
    for m in metas:
        cat = m["category"]
        st = m.get("status", "info")
        lines.append(f"### {STATUS_EMOJI[st]} {m['title']}")
        lines.append("")
        lines.append(f"> {m.get('description', '')}")
        lines.append("")
        for img in m.get("images", []):
            file_rel = f"./{cat}/{img['file']}"
            lines.append(f"**{img.get('caption', img['file'])}**")
            lines.append("")
            lines.append(f"![{img.get('caption', img['file'])}]({file_rel})")
            lines.append("")
        lines.append(f"[📁 리포트 폴더 열기](./{cat}/)")
        lines.append("")
        lines.append("---")
        lines.append("")

    # 실행 가이드
    lines.append("## 재실행")
    lines.append("")
    lines.append("```bash")
    lines.append("# 개별 EDA")
    lines.append("python scripts/eda_company_size.py --kodata <path.xlsx>")
    lines.append("python scripts/eda_finance_recovery.py --kodata <path.xlsx>")
    lines.append("python scripts/eda_selection_result.py --btp <path.xlsx>")
    lines.append("")
    lines.append("# 인덱스 재생성 (개별 EDA 실행 후)")
    lines.append("python scripts/eda_index.py")
    lines.append("")
    lines.append("# 전체 파이프라인 (개별 EDA + 인덱스 한 번에)")
    lines.append("bash scripts/run_data_pipeline.sh --eda-only")
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def _open_file(p: Path) -> None:
    """OS별로 파일 열기 (Windows / Mac / Linux)."""
    try:
        if platform.system() == "Windows":
            os.startfile(str(p))  # type: ignore[attr-defined]
        elif platform.system() == "Darwin":
            subprocess.run(["open", str(p)])
        else:
            subprocess.run(["xdg-open", str(p)])
    except Exception as e:  # noqa: BLE001
        print(f"⚠️ 파일 열기 실패: {e}")


def main() -> None:
    ap = argparse.ArgumentParser(description="EDA 리포트 인덱스 생성 (eda_reports/INDEX.md)")
    ap.add_argument("--open", action="store_true", help="생성 후 파일 열기")
    args = ap.parse_args()

    metas = load_all_meta()
    if not metas:
        print("⚠️ eda_reports/ 에 meta.json이 없습니다.")
        print("   먼저 EDA 스크립트를 실행하세요: python scripts/eda_company_size.py")
        sys.exit(1)

    md = build_index_md(metas)
    out = REPORTS_DIR / "INDEX.md"
    out.write_text(md, encoding="utf-8")
    print(f"✅ INDEX.md 생성: {out}")
    print(f"   총 {len(metas)}개 리포트 · {sum(len(m.get('images', [])) for m in metas)}개 이미지")

    if args.open:
        _open_file(out)


if __name__ == "__main__":
    main()
