@echo off
rem Start local llama.cpp server for AI Humanizer 12B model
setlocal enabledelayedexpansion

cd /d "%~dp0"
set ROOT=%CD%
set MODEL_DIR=%ROOT%\local-model\gguf
set GGUF=humanizer-12b-Q3-QAT.gguf
set PORT=8080
set NGL=0
set THREADS=10

if exist "%ROOT%\tools\llama\vulkan\llama-server.exe" (
    set "LLAMA_SERVER=%ROOT%\tools\llama\vulkan\llama-server.exe"
) else if exist "%ROOT%\tools\llama\cpu\llama-server.exe" (
    set "LLAMA_SERVER=%ROOT%\tools\llama\cpu\llama-server.exe"
) else (
    echo [ERROR] llama-server.exe not found in tools\llama\vulkan or tools\llama\cpu!
    pause
    exit /b 1
)

set "MODEL_PATH=%MODEL_DIR%\%GGUF%"
if not exist "%MODEL_PATH%" (
    echo [ERROR] Model file not found: %MODEL_PATH%
    pause
    exit /b 1
)

echo ========================================================
echo   Starting Local Humanizer 12B Model Server
echo ========================================================
echo   Binary:   %LLAMA_SERVER%
echo   Model:    %GGUF%
echo   Endpoint: http://127.0.0.1:%PORT%/completion
echo   Web UI:   http://127.0.0.1:%PORT%/index.html
echo ========================================================
echo.

"%LLAMA_SERVER%" ^
  -m "%MODEL_PATH%" ^
  -c 8192 -np 1 -t %THREADS% -ngl %NGL% ^
  -lm mmap -lzm on -cram 2048 ^
  -ctk q8_0 -ctv q8_0 ^
  --host 127.0.0.1 --port %PORT% ^
  --path "%ROOT%" ^
  --temp 1.0 --top-p 0.95 --top-k 0 --min-p 0 --repeat-penalty 1.0

pause
