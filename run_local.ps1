# PowerShell script to start local llama.cpp server
$Root = $PSScriptRoot
$ModelDir = Join-Path $Root "local-model\gguf"
$Gguf = "humanizer-12b-Q3-QAT.gguf"
$Port = 8080
$Ngl = 0
$Threads = 10

$VulkanBin = Join-Path $Root "tools\llama\vulkan\llama-server.exe"
$CpuBin = Join-Path $Root "tools\llama\cpu\llama-server.exe"

if (Test-Path $VulkanBin) {
    $LlamaServer = $VulkanBin
} elseif (Test-Path $CpuBin) {
    $LlamaServer = $CpuBin
} else {
    Write-Error "llama-server.exe not found in tools/llama/vulkan or tools/llama/cpu"
    exit 1
}

$ModelPath = Join-Path $ModelDir $Gguf
if (-not (Test-Path $ModelPath)) {
    Write-Error "Model file not found: $ModelPath"
    exit 1
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting Local Humanizer 12B Model Server" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Binary:   $LlamaServer"
Write-Host "  Model:    $Gguf"
Write-Host "  Endpoint: http://127.0.0.1:$Port/completion"
Write-Host "  Web UI:   http://127.0.0.1:$Port/index.html"
Write-Host "========================================================" -ForegroundColor Cyan

& $LlamaServer `
  -m $ModelPath `
  -c 8192 -np 1 -t $Threads -ngl $Ngl `
  -lm mmap -lzm on -cram 2048 `
  -ctk q8_0 -ctv q8_0 `
  --host 127.0.0.1 --port $Port `
  --path $Root `
  --temp 1.0 --top-p 0.95 --top-k 0 --min-p 0 --repeat-penalty 1.0
