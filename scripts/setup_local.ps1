# dive-BTP 로컬 개발 환경 원샷 세팅 (PowerShell)
#
# 전제:
#   - Docker Desktop 실행 중
#   - backend/etl/data/에 data1.xlsx, data2.xlsx가 KODATA·부산TP 원본명으로 복사됨
#     (없으면 이 스크립트가 data1.xlsx/data2.xlsx에서 자동 복사)
#
# 순서: db 기동 → 대기 → 마이그레이션 → ETL → backend+frontend 기동 → 브라우저 열기

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ============================================================
# 0. 데이터 파일 준비 (없으면 복사)
# ============================================================
$dataDir = Join-Path $root "backend\etl\data"
$kodataDst = Join-Path $dataDir "배포_샘플_KODATA_기업데이터_26-07-06.xlsx"
$btpDst    = Join-Path $dataDir "배포_샘플_부산TP__사업기업목록_26-07-06.xlsx"

if (-not (Test-Path $kodataDst) -or -not (Test-Path $btpDst)) {
    Write-Host "[0/6] 데이터 파일 복사..."
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Copy-Item (Join-Path $root "data1.xlsx") $kodataDst -Force
    Copy-Item (Join-Path $root "data2.xlsx") $btpDst -Force
    Write-Host "      → $dataDir 에 복사 완료`n"
} else {
    Write-Host "[0/6] 데이터 파일 이미 있음 (스킵)`n"
}

# ============================================================
# 1. DB 컨테이너 기동
# ============================================================
Write-Host "[1/6] PostgreSQL 컨테이너 기동..."
docker compose up -d db
if ($LASTEXITCODE -ne 0) { throw "docker compose up db 실패" }

# ============================================================
# 2. DB ready 대기 (최대 30초)
# ============================================================
Write-Host "[2/6] DB 준비 대기..."
$maxAttempts = 15
for ($i = 1; $i -le $maxAttempts; $i++) {
    docker compose exec -T db pg_isready -U foedev -d foedev *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      → ready ($i회 시도)`n"
        break
    }
    if ($i -eq $maxAttempts) { throw "DB ready 안 됨 (30초 초과)" }
    Start-Sleep -Seconds 2
}

# ============================================================
# 3. 마이그레이션 실행 (SQL 파일 순차 실행)
# ============================================================
Write-Host "[3/6] 마이그레이션 실행..."
$migrations = Get-ChildItem "db\migrations\*.sql" | Sort-Object Name
foreach ($sql in $migrations) {
    Write-Host "      ▶ $($sql.Name)"
    Get-Content $sql.FullName -Raw -Encoding UTF8 |
        docker compose exec -T db psql -U foedev -d foedev -v ON_ERROR_STOP=1 --quiet *>&1 |
        Out-Null
    if ($LASTEXITCODE -ne 0) { throw "$($sql.Name) 실패" }
}
Write-Host "      → 완료`n"

# ============================================================
# 4. Backend 이미지 빌드 (필요 시) + ETL 실행
# ============================================================
Write-Host "[4/6] Backend 이미지 빌드 (첫 실행 시 1~2분)..."
docker compose build backend
if ($LASTEXITCODE -ne 0) { throw "backend 빌드 실패" }

Write-Host "`n[5/6] ETL 실행 (data1/2.xlsx → DB, 1~3분)..."
docker compose run --rm backend python etl/run_etl.py
if ($LASTEXITCODE -ne 0) { throw "ETL 실패" }

# ============================================================
# 5. Backend + Frontend 기동
# ============================================================
Write-Host "`n[6/6] Backend·Frontend 기동..."
docker compose up -d backend frontend
if ($LASTEXITCODE -ne 0) { throw "backend·frontend 기동 실패" }

# Frontend는 npm install + Next.js dev 부팅에 시간 걸림
Write-Host "      → 프론트 부팅 대기 (~30초)..."
Start-Sleep -Seconds 30

# ============================================================
# 완료 안내
# ============================================================
Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "✅ 세팅 완료" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  프론트:      http://localhost:3000"
Write-Host "  백엔드 API:  http://localhost:8000"
Write-Host "  Swagger UI:  http://localhost:8000/docs"
Write-Host "  DB:          localhost:5432 (foedev / foedev / foedev)"
Write-Host ""
Write-Host "  로그 보기:   docker compose logs -f backend frontend"
Write-Host "  중지:        docker compose down"
Write-Host "  초기화:      docker compose down -v (DB 데이터도 삭제)"
Write-Host ""

# 브라우저 자동 열기
Start-Process "http://localhost:3000"
