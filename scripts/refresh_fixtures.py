"""API 응답 → frontend/lib/fixtures/*.json 갱신.

용도:
  프론트 fixture 모드(NEXT_PUBLIC_API_BASE_URL 없을 때) 데모 · 개발용.
  companies/rankings/dashboard 응답을 그대로 JSON으로 저장 →
  프론트가 이 fixture로 축8·9 UI 검증 가능.

사용법:
  # docker compose 백엔드 컨테이너 안에서 실행 (localhost:8000 접근)
  docker compose exec backend python /scripts/refresh_fixtures.py

  # 또는 로컬(호스트)에서 (백엔드 컨테이너 포트 노출 상태):
  python scripts/refresh_fixtures.py --api http://localhost:8000
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "frontend" / "lib" / "fixtures"


def fetch(url: str):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000",
                    help="Backend API base URL (컨테이너 안에서 localhost:8000, 호스트에서도 8000 노출 시 동일)")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for name in ["companies", "rankings", "dashboard"]:
        url = f"{args.api}/{name}"
        try:
            data = fetch(url)
        except Exception as e:
            print(f"❌ {name}: {type(e).__name__}: {e}", file=sys.stderr)
            sys.exit(1)
        path = OUT_DIR / f"{name}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        size = path.stat().st_size
        count = len(data) if isinstance(data, list) else "-"
        print(f"  ✓ {name}.json ({size:,} bytes, {count} items)")

    print(f"\n✅ fixture 갱신 완료: {OUT_DIR}")


if __name__ == "__main__":
    main()
