# Running the humanizer model locally

## Hardware detected

| Item | Value |
|---|---:|
| RAM | 15.43 GB total |
| Available RAM at check | ~1.89 GB |
| CPU | 14 logical processors |
| GPU | Intel integrated graphics, ~2 GB reported/shared |
| Free disk | ~744 GB |

This machine can run the smaller GGUF builds. It cannot comfortably run Q8_0 or bf16.

## Status

Downloads are complete and verified:

- Q3 GGUF size: `5,587,794,816` bytes
- Q3 SHA-256: `307bbfdf66fb22bf98aaa93fe7d54a713bf167e646073dc0cf10870b1525eb94`
- CPU and Vulkan zip sizes match the GitHub release metadata.
- `llama-server.exe --help` confirms `-lm`, `-lzm`, `-cram`, `-ctk`, `-ngl` and the exact sampling flags are supported.
- Server started successfully and `/health` returned `{"status":"ok"}`.
- Smoke rewrite succeeded with no missing or added numbers.
- While the model is loaded, `llama-server` uses about 5.5 GB working set and free RAM drops to roughly 0.3 GB. Close other applications before running longer batches.
- Measured CPU speed on this machine: prompt processing ~13–18 tokens/s, generation ~1.4–2.5 tokens/s. A 300-word rewrite takes roughly 4–5 minutes.
- First 12-draft batch hit a Node keep-alive `fetch failed`; fixed with `Connection: close`, retries, and incremental/resumable output writes.
- Verified 2-draft rerun: reuse `0.0071` and `0.0329`, zero critical fidelity failures. This is far below the local rule engine's ~0.72–0.86 reuse.

## Downloaded artifacts

The setup uses portable llama.cpp binaries and a GGUF from the model author. No global install is required.

```text
tools/llama/llama-b12359-bin-win-cpu-x64.zip
tools/llama/llama-b12359-bin-win-vulkan-x64.zip
local-model/gguf/humanizer-12b-Q3-QAT.gguf
local-model/gguf/prompt_format.json
```

## Which quantization to use

Current model-card figures:

| File | File size | Peak memory | Top-1 vs bf16 | Fact flags / 420 | Originality strict flags / 60 | Best for |
|---|---:|---:|---:|---:|---:|---|
| `Q8_0` | 12.7 GB | 13.7 GB | 98.4% | 44 | 7 | 32 GB+ machines |
| `Q6_K` | 10.0 GB | ~11.0 GB | 97.7% | 56 | not measured | 16 GB machines |
| `Q4_K_M` | 7.6 GB | 10.0 GB | 95.2% | 58 | not measured | ~14 GB, slight loss |
| `Q3-QAT` | 5.6 GB | 8.0 GB | 93.1% | 64 | 4 | 12 GB, small loss |
| `IQ2_XS-QAT` | 3.9 GB | 6.2 GB | 87.4% | 70 | 0 | 8 GB, lowest fidelity |

**Chosen for this machine:** `Q3-QAT`.

Reason: Q4_K_M would also fit in principle, but only ~1.9 GB RAM was free when the system was checked. Q3-QAT needs about 8 GB peak and leaves more room for the browser, OS and KV cache. It has more fact slips than Q4_K_M, so the fidelity checker remains important.

If you close most applications and want slightly better fidelity, download `Q4_K_M` later and swap the filename.

## About “streaming” the model

There are two different ideas:

### 1. Streaming weights over the network during inference

Standard llama.cpp does **not** normally stream weights from Hugging Face over the network token by token. Flags such as `-hf` and `--model-url` download/cache the model first. Tools like Petals or RPC backends can split inference across machines, but that is not useful for a single laptop and adds privacy/complexity issues.

### 2. Memory-mapping and lazy loading from local disk

This is the practical option, and llama.cpp supports it:

```text
--load-mode mmap   memory-map the GGUF instead of loading it all into RAM
--lazy-mode on     read large tensors from disk on demand
```

This makes startup fast and lowers resident memory. The OS loads only the pages actually touched. It is effectively “streaming from SSD”, not from the internet.

Important limit: during generation, most weights are eventually needed. If the model does not fit comfortably in RAM, Windows will page from disk and speed will drop sharply. Streaming reduces pressure; it does not make a 12B model free.

## Memory-saving options

For this machine, use:

```bash
-c 8192
-np 1
-t 10
-lm mmap
-lzm on
-cram 2048
-ctk q8_0
-ctv q8_0
```

- `-c 8192` follows the model card's context guidance.
- `-np 1` allows one active request only.
- `-t 10` leaves CPU headroom instead of using all 14 logical cores.
- `-lm mmap` and `-lzm on` enable disk-backed loading.
- `-cram 2048` caps the CPU prompt cache.
- `-ctk q8_0 -ctv q8_0` halve the KV-cache memory. Remove these two flags if output quality looks degraded.

## Start the server

After the downloads finish, extract the zip files into:

```text
tools/llama/cpu/
tools/llama/vulkan/
```

Then run from Git Bash in the project root:

```bash
./run_local.sh
```

The script starts:

```text
http://127.0.0.1:8080
```

## Browser testing

The preview panel's proxy origin may block cross-origin localhost requests. `run_local.sh` now serves the project directory through llama.cpp with `--path`, so open the test page at the same origin:

```text
http://127.0.0.1:8080/local_test.html
```

Use that URL instead of the separate preview URL if browser fetch is blocked.

Use the `/completion` endpoint, not `/v1/chat/completions`. The prompt must be byte-exact:

```text
INSTR + "\n\n" + draft.strip() + "\n\n### Rewritten:\n\n"
```

Sampling must be:

```text
temperature 1.0
top_p 0.95
top_k 0
min_p 0
repetition_penalty 1.0
n_predict 2048
```

No stop strings. The model ends on EOS.

## Intel GPU note

The Vulkan build may offload some layers to the Intel iGPU:

```bash
NGL=auto ./run_local.sh
```

But Intel integrated graphics uses shared system RAM, so this is often slower than expected. If Vulkan is unstable, use the CPU build:

```bash
LLAMA_SERVER=./tools/llama/cpu/llama-server.exe NGL=0 ./run_local.sh
```

## Expected performance

Do not expect the model-card speed of 36–38 tokens/s; that was measured with Metal on an M5 Max. A 12B model on integrated graphics or CPU will be much slower. The goal here is working offline inference with correct fidelity, not parity with a GPU server.

## Next validation steps

1. Verify file size and SHA-256 checksum.
2. Start the server with Q3-QAT.
3. Run a single 300-word smoke draft through `/completion`.
4. Check fidelity with the benchmark checker.
5. Generate Turnitin-ready outputs from the local model instead of the weak local rules.
