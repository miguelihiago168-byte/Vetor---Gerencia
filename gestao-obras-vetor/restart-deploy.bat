@echo off
REM Reinicia backend e frontend apos deploy
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart_after_deploy.ps1"
