#!/usr/bin/env bash
# Offline path for jialinyyzz/humanizer (12B Gemma 4) on this Windows machine.
# Uses portable llama.cpp and a memory-mapped GGUF; no global install required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MODEL_DIR="$ROOT/local-model/gguf"
GGUF="${GGUF:-humanizer-12b-Q3-QAT.gguf}"
PORT="${PORT:-8080}"
NGL="${NGL:-0}"
THREADS="${THREADS:-10}"
STATIC_DIR="${STATIC_DIR:-$ROOT}"

if [[ -z "${LLAMA_SERVER:-}" ]]; then
  if [[ -x "$ROOT/tools/llama/vulkan/llama-server.exe" ]]; then
    LLAMA_SERVER="$ROOT/tools/llama/vulkan/llama-server.exe"
  elif [[ -x "$ROOT/tools/llama/cpu/llama-server.exe" ]]; then
    LLAMA_SERVER="$ROOT/tools/llama/cpu/llama-server.exe"
  else
    echo "llama-server.exe not found. Extract the downloaded zip into tools/llama/vulkan or tools/llama/cpu." >&2
    exit 1
  fi
fi

MODEL_PATH="$MODEL_DIR/$GGUF"
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Model file not found: $MODEL_PATH" >&2
  echo "Download it with:" >&2
  echo "  curl -L -o \"$MODEL_PATH\" \"https://huggingface.co/jialinyyzz/humanizer/resolve/main/$GGUF?download=true\"" >&2
  exit 1
fi

if [[ ! -f "$MODEL_DIR/prompt_format.json" ]]; then
  echo "prompt_format.json not found in $MODEL_DIR" >&2
  exit 1
fi

echo "Starting local humanizer: $GGUF"
echo "Server binary: $LLAMA_SERVER"
echo "Endpoint: http://127.0.0.1:$PORT/completion"
echo "GPU layers: $NGL (0 = CPU only)"

exec "$LLAMA_SERVER" \
  -m "$MODEL_PATH" \
  -c 8192 -np 1 -t "$THREADS" -ngl "$NGL" \
  -lm mmap -lzm on -cram 2048 \
  -ctk q8_0 -ctv q8_0 \
  --host 127.0.0.1 --port "$PORT" \
  --path "$STATIC_DIR" \
  --temp 1.0 --top-p 0.95 --top-k 0 --min-p 0 --repeat-penalty 1.0

# Prompt construction (byte-exact, from prompt_format.json):
#   instr + "\n\n" + draft.strip() + sep
# Sampling: temperature 1.0, top_p 0.95, top_k 0, min_p 0,
#           repeat_penalty 1.0, n_predict 2048.
# No stop strings. Do not apply a chat template on the /completion path.
