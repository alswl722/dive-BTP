"""EDA 시각화 공용 헬퍼 — 한글 폰트·저장·색상 통일.

각 EDA 스크립트가 이 모듈을 import 해서 matplotlib 셋업/저장을 표준화한다.
개별 스크립트는 pyplot API 그대로 사용하고 저장만 이 헬퍼로 통일.

폴더 구조:
    eda_reports/
    ├── INDEX.md              ← 별도 scripts/eda_index.py가 생성
    ├── 01_company_size/
    │   ├── missing_rate.png
    │   └── size_distribution.png
    ├── 02_finance_recovery/
    │   └── ...
    └── ...

사용 예:
    from eda_viz import get_reports_dir, save_fig, setup

    setup()  # 첫 호출 시 한글 폰트·스타일 셋업
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.bar(...)
    save_fig(fig, "01_company_size", "missing_rate", "컬럼별 결측률")
"""

from __future__ import annotations

import json
import os
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any

# matplotlib은 Agg 백엔드로 강제 (헤드리스 실행 환경 대응)
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
import matplotlib.pyplot as plt


# ============================================================
# 경로 — CWD 상대 기준. 실행 위치에 따라 자연스러운 위치에 리포트가 쌓이도록.
#   - 프로젝트 루트에서 실행: dive-BTP/eda_reports/
#   - 도커 컨테이너에서 실행: /app/eda_reports/ (backend/ 아래로 마운트되면 host의 backend/eda_reports)
# 환경변수 EDA_REPORTS_DIR로 명시 지정 가능(CI·팀 공유 폴더 등).
# ============================================================
REPORTS_DIR = Path(os.environ.get("EDA_REPORTS_DIR") or "eda_reports").resolve()

# 색상 팔레트 — 프론트 브랜드톤(blue-slate)와 대략 맞춤. 스코어카드 신호색과 조화되도록.
PALETTE = {
    "primary": "#2563eb",   # 브랜드 블루
    "good":    "#16a34a",   # green-600
    "warn":    "#d97706",   # amber-600
    "bad":     "#dc2626",   # red-600
    "muted":   "#94a3b8",   # slate-400
    "info":    "#0284c7",   # sky-600
}


# ============================================================
# 초기 셋업 — 한글 폰트 + 스타일
# ============================================================
_INITIALIZED = False


def setup() -> None:
    """한글 폰트 감지·설정, matplotlib 기본 스타일 통일. idempotent."""
    global _INITIALIZED
    if _INITIALIZED:
        return

    # 한글 폰트 후보 (Windows·Docker·Mac 순).
    # 없으면 DejaVu Sans로 폴백(한글은 깨지지만 그래프는 그려짐 — 실행 자체를 막지 않는다).
    candidates = ["NanumGothic", "Malgun Gothic", "AppleGothic", "Noto Sans CJK KR"]
    available = {f.name for f in fm.fontManager.ttflist}
    picked = next((c for c in candidates if c in available), None)

    if picked:
        plt.rcParams["font.family"] = picked
    else:
        warnings.warn(
            "한글 폰트를 찾지 못했습니다. 라벨이 □로 표시될 수 있습니다. "
            "설치 예: apt-get install fonts-nanum (Ubuntu), 또는 시스템에 나눔고딕 폰트 추가."
        )
    # 마이너스 부호 깨짐 방지 (한글 폰트 사용 시 필수)
    plt.rcParams["axes.unicode_minus"] = False

    # 스타일 통일 — 흰 배경·그리드, 발표자료에 붙일 수 있는 톤
    plt.rcParams["figure.facecolor"] = "white"
    plt.rcParams["axes.facecolor"] = "white"
    plt.rcParams["axes.grid"] = True
    plt.rcParams["grid.color"] = "#e5e7eb"
    plt.rcParams["grid.linewidth"] = 0.5
    plt.rcParams["axes.spines.top"] = False
    plt.rcParams["axes.spines.right"] = False
    plt.rcParams["axes.titlesize"] = 13
    plt.rcParams["axes.titleweight"] = "bold"
    plt.rcParams["axes.labelsize"] = 11
    plt.rcParams["xtick.labelsize"] = 10
    plt.rcParams["ytick.labelsize"] = 10
    plt.rcParams["legend.fontsize"] = 10
    plt.rcParams["figure.dpi"] = 100

    _INITIALIZED = True


# ============================================================
# 리포트 폴더
# ============================================================
def get_reports_dir(category: str | None = None) -> Path:
    """eda_reports/[category] 디렉토리를 반환하고 없으면 생성.

    category=None이면 최상위 eda_reports/ 반환 (INDEX.md, SUMMARY 파일용).
    """
    d = REPORTS_DIR / category if category else REPORTS_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


# ============================================================
# 저장
# ============================================================
def save_fig(
    fig,
    category: str,
    name: str,
    title: str | None = None,
    dpi: int = 150,
) -> Path:
    """fig를 eda_reports/<category>/<name>.png로 저장. 파일 경로 반환.

    title이 있으면 fig에 suptitle로 얹는다 (개별 스크립트가 미리 얹었으면 무시됨 — 덮어씀 방지).
    """
    setup()
    if title and not fig._suptitle:
        fig.suptitle(title, fontsize=14, fontweight="bold", y=0.98)
    fig.tight_layout(rect=(0, 0, 1, 0.96) if title else None)
    out = get_reports_dir(category) / f"{name}.png"
    fig.savefig(out, dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    return out


# ============================================================
# 리포트 메타데이터
# ============================================================
def write_meta(
    category: str,
    *,
    title: str,
    description: str,
    images: list[dict[str, str]],
    highlights: list[str] | None = None,
    status: str = "info",   # good | warn | bad | info
) -> Path:
    """eda_reports/<category>/meta.json 저장. eda_index.py가 이걸 읽어 INDEX.md 생성.

    images: [{"file": "missing_rate.png", "caption": "컬럼별 결측률"}]
    highlights: 상위 몇 개 이상치·경고 문장. 없으면 표시 안 함.
    """
    meta: dict[str, Any] = {
        "category": category,
        "title": title,
        "description": description,
        "images": images,
        "highlights": highlights or [],
        "status": status,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
    out = get_reports_dir(category) / "meta.json"
    out.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


def load_all_meta() -> list[dict[str, Any]]:
    """eda_reports/*/meta.json 모두 읽어 category 순으로 정렬 후 반환."""
    if not REPORTS_DIR.exists():
        return []
    out = []
    for d in sorted(REPORTS_DIR.iterdir()):
        if not d.is_dir():
            continue
        meta_path = d / "meta.json"
        if meta_path.exists():
            try:
                out.append(json.loads(meta_path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                warnings.warn(f"meta.json 파싱 실패: {meta_path}")
    return out


# ============================================================
# 스탠드얼론 스모크 테스트
# ============================================================
if __name__ == "__main__":
    import numpy as np

    setup()
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.bar(["A", "B", "가나다", "라마바"], [3, 7, 5, 9], color=PALETTE["primary"])
    ax.set_title("eda_viz 스모크 테스트 — 한글 폰트 확인")
    ax.set_ylabel("값")
    out = save_fig(fig, "_smoke", "test", "eda_viz 스모크 테스트")
    print(f"저장: {out}")
    write_meta(
        "_smoke",
        title="스모크 테스트",
        description="한글 폰트·저장·메타 정상 동작 확인",
        images=[{"file": "test.png", "caption": "라벨 한글 렌더 확인"}],
        highlights=["한글 폰트 감지: " + (plt.rcParams["font.family"][0] if isinstance(plt.rcParams["font.family"], list) else plt.rcParams["font.family"])],
        status="good",
    )
    print("메타 저장 완료")
