@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions
title HALOFLUX AI LINK - stop

rem ============================================================
rem  HALOFLUX . AI LINK  -  stop the local telemetry service
rem  Noncommercial fan modification of HALOFLUX by Ryder191.
rem  PolyForm Noncommercial 1.0.0 - see LICENSE.
rem ============================================================

set "DIR=E:\steam\steamapps\common\wallpaper_engine\projects\myprojects\HALOFLUX_AI"
set "PIDFILE=%DIR%\ai-link.pid"
set "PROBE=powershell -NoProfile -ExecutionPolicy Bypass -Command try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',8737);$c.Close();exit 0}catch{exit 1}"

rem --- 1) pid file written by the service ----------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "if(Test-Path '%PIDFILE%'){ $p=(Get-Content '%PIDFILE%' -Raw); if($p){$p=$p.Trim()}; if($p -match '^[0-9]+$'){ $pr=Get-Process -Id ([int]$p) -ErrorAction SilentlyContinue; if($pr){ Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue; Write-Host ('[AI LINK] stopped pid ' + $pr.Id) } }; Remove-Item '%PIDFILE%' -Force -ErrorAction SilentlyContinue }" 2>nul

rem --- 2) whoever owns port 8737 --------------------------------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:"127.0.0.1:8737" ^| findstr /c:"LISTENING"') do (
  taskkill /PID %%p /T /F >nul 2>&1
  echo [AI LINK] stopped pid %%p  ^(port 8737^)
)

rem --- 3) last resort: any node.exe whose command line points here
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*ai-link-server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

rem --- verify --------------------------------------------------
%PROBE% >nul 2>&1
if errorlevel 1 (
  echo [AI LINK] service stopped. port 8737 is free.
  exit /b 0
)
echo [AI LINK] WARNING: something is still listening on 127.0.0.1:8737
echo             run:  netstat -ano ^| findstr 8737
timeout /t 6 /nobreak >nul 2>&1
exit /b 1
