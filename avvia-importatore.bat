@echo off
chcp 65001 >nul
title Importatore sottotitoli
cd /d "%~dp0importatore"

where python >nul 2>nul
if errorlevel 1 (
  echo Python non e' installato.
  echo Scaricalo da https://www.python.org/downloads/ e, durante l'installazione,
  echo spunta la casella "Add python.exe to PATH". Poi riapri questo file.
  pause
  exit /b 1
)

python -c "import youtube_transcript_api" 2>nul
if errorlevel 1 (
  echo Installo la libreria per i sottotitoli, serve solo la prima volta...
  python -m pip install --quiet -r requirements.txt
  if errorlevel 1 (
    echo Installazione non riuscita: controlla la connessione e riprova.
    pause
    exit /b 1
  )
)

python importatore.py
pause
