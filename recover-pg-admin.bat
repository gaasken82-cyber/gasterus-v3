@echo off
REM ============================================================
REM  GASTERUS V3 - PostgreSQL Password Recovery (NON-DESTRUCTIVE)
REM  Run this ONCE as Administrator (right-click > Run as Admin,
REM  or:  powershell -ExecutionPolicy Bypass -File recover-pg-admin.ps1)
REM  It does NOT drop/delete/reset any data. Only resets the
REM  postgres password via pg_hba.conf trust -> scram-sha-256.
REM ============================================================
echo.
echo  Checking Administrator rights...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] You are NOT running as Administrator.
    echo  Right-click this file > Run as Administrator, or run:
    echo    powershell -ExecutionPolicy Bypass -File "%~dp0recover-pg-admin.ps1"
    pause
    exit /b 1
)
echo  [OK] Administrator rights confirmed.
echo.

REM ---- Store the new password in a temp file to avoid batch escaping issues
set NEWPW_FILE=%~dp0_pg_newpass.tmp
powershell -NoProfile -Command "Write-Output 'GasterusRecovery!2026'" > "%NEWPW_FILE%"

set DATADIR=C:\Program Files\PostgreSQL\18\data
set PGCONF=%DATADIR%\pg_hba.conf
set PGCONF_BAK=%DATADIR%\pg_hba.conf.admin_bak
set PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe
set PGCTL=C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe

echo  [1/7] Stopping PostgreSQL service...
net stop postgresql-x64-18 >nul 2>&1
if %errorlevel% neq 0 (
    echo   ... (may already be stopped)
)
timeout /t 3 /nobreak >nul

echo  [2/7] Backing up pg_hba.conf...
copy /Y "%PGCONF%" "%PGCONF_BAK%" >nul

echo  [3/7] Setting auth method to trust (temporary)...
powershell -NoProfile -Command ^
    "$p='%PGCONF%';$c=Get-Content $p -Raw;$c2=$c.Replace('scram-sha-256','trust');Set-Content $p $c2 -Encoding UTF8"

echo  [4/7] Starting PostgreSQL with trust auth...
net start postgresql-x64-18 >nul 2>&1
timeout /t 5 /nobreak >nul

echo  [5/7] Setting new password for postgres user...
set /p NEWPASS=<"%NEWPW_FILE%"
set PGPASSWORD=
"%PSQL%" -U postgres -h localhost -e -c "ALTER USER postgres WITH PASSWORD '%NEWPASS%';"
if %errorlevel% neq 0 (
    echo   [ERROR] ALTER USER failed. See output above.
    goto :restore
)

echo  [6/7] Restoring pg_hba.conf to scram-sha-256...
copy /Y "%PGCONF_BAK%" "%PGCONF%" >nul
powershell -NoProfile -Command ^
    "$p='%PGCONF%';$c=Get-Content $p -Raw;$c=$c.Replace('trust','scram-sha-256');Set-Content $p $c -Encoding UTF8"

echo  [7/7] Restarting PostgreSQL...
net stop postgresql-x64-18 >nul 2>&1
timeout /t 3 /nobreak >nul
net start postgresql-x64-18 >nul 2>&1
timeout /t 5 /nobreak >nul

echo.
echo  ============================================================
echo   Testing connection with new password...
echo  ============================================================
set PGPASSWORD=%NEWPASS%
"%PSQL%" -U postgres -h localhost -c "SELECT now();"
if %errorlevel% equ 0 (
    echo.
    echo   [SUCCESS] PostgreSQL authentication restored.
    echo   New password: %NEWPASS%
) else (
    echo   [FAIL] Connection test failed. Check pg_hba.conf and password.
)

:restore
if exist "%NEWPW_FILE%" del "%NEWPW_FILE%"
echo.
pause