#!/usr/bin/env pwsh
# ============================================================
#  GASTERUS V3 - PostgreSQL Password Recovery (NON-DESTRUCTIVE)
#  Run ONCE as Administrator:
#     powershell -ExecutionPolicy Bypass -File recover-pg-admin.ps1
#  Does NOT drop/delete/reset any data. Only resets the postgres
#  password via pg_hba.conf trust -> scram-sha-256.
# ============================================================

$ErrorActionPreference = "Stop"

# ---- Admin check ----
if (-not ([Security.Principal]::Current.IsInRole("Administrator"))) {
    Write-Host "[ERROR] You are NOT running as Administrator."
    Write-Host "Right-click this file > Run as PowerShell, or switch to admin."
    exit 1
}
Write-Host "[OK] Administrator rights confirmed." -ForegroundColor Green

$DATADIR   = "C:\Program Files\PostgreSQL\18\data"
$PGCONF    = Join-Path $DATADIR "pg_hba.conf"
$PGCONF_BAK= Join-Path $DATADIR "pg_hba.conf.admin_bak"
$PSQL      = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$NEWPASS   = "GasterusRecovery!2026"

Write-Host "`n[1/7] Stopping PostgreSQL service..."
Stop-Process -Name postgres -Force -ErrorAction SilentlyContinue
net stop postgresql-x64-18 2>&1 | Out-Null
Start-Sleep 3

Write-Host "[2/7] Backing up pg_hba.conf..."
Copy-Item $PGCONF $PGCONF_BAK -Force

Write-Host "[3/7] Setting auth method to trust (temporary)..."
$c = Get-Content $PGCONF -Raw
Set-Content $PGCONF ($c -replace "scram-sha-256", "trust") -Encoding UTF8

Write-Host "[4/7] Starting PostgreSQL with trust auth..."
net start postgresql-x64-18 2>&1 | Out-Null
Start-Sleep 5

Write-Host "[5/7] Setting new password for postgres..."
$rc = & $PSQL -U postgres -h localhost -c "ALTER USER postgres WITH PASSWORD '$NEWPASS';"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] ALTER USER failed." -ForegroundColor Red
    Copy-Item $PGCONF_BAK $PGCONF -Force
    Write-Host "Config restored. Investigate and re-run." -ForegroundColor Red
    exit 3
}

Write-Host "[6/7] Restoring pg_hba.conf to scram-sha-256..."
$c2 = Get-Content $PGCONF -Raw
Set-Content $PGCONF ($c2 -replace "trust", "scram-sha-256") -Encoding UTF8

Write-Host "[7/7] Restarting PostgreSQL..."
net stop postgresql-x64-18 2>&1 | Out-Null
Start-Sleep 3
net start postgresql-x64-18 2>&1 | Out-Null
Start-Sleep 5

# ---- Test ----
Write-Host "`n==== Testing connection with new password ====" -ForegroundColor Cyan
$env:PGPASSWORD = $NEWPASS
$out = & $PSQL -U postgres -h localhost -c "SELECT now();"
if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCCESS] PostgreSQL authentication restored." -ForegroundColor Green
    Write-Host "New password: $NEWPASS" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Connection test failed." -ForegroundColor Red
}
Write-Host ""
pwd