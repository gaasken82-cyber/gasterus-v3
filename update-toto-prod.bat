@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
    node scripts\set-toto-result.mjs --help
    goto :eof
)

node scripts\set-toto-result.mjs --prod %*
endlocal
