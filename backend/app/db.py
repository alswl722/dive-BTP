"""DATABASE_URL 기반 SQLAlchemy 엔진(싱글턴).

패턴은 backend/etl/features_finance.py의 _engine()과 동일 — 여러 요청이 같은
커넥션 풀을 재사용하도록 lru_cache로 프로세스당 1개만 생성한다.
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL 미설정 — .env 확인 (docker-compose와 동일 값)")
    return create_engine(url)
