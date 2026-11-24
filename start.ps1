$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$settingsPath = Join-Path $root "runtime/settings.json"
$settings = Get-Content -Raw -Encoding UTF8 $settingsPath | ConvertFrom-Json
$horizon = $settings.horizon_path
$python = if ($env:HORIZON_PYTHON) { $env:HORIZON_PYTHON } else { Join-Path $horizon ".venv/Scripts/python.exe" }
if (-not (Test-Path $python)) { $python = "python" }

& $python -c "import fastapi, uvicorn, filelock" 2>$null
if ($LASTEXITCODE -ne 0) {
    & uv pip install --python $python -r (Join-Path $root "backend/requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw "Python dependencies installation failed." }
}

Push-Location (Join-Path $root "frontend")
try {
    if (-not (Test-Path "node_modules")) { & pnpm install }
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
    & pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
}
finally {
    Pop-Location
}

$env:PYTHONUTF8 = "1"
$url = "http://127.0.0.1:$($settings.port)"
$opener = Start-Job -ScriptBlock {
    param($target)
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        try {
            Invoke-WebRequest -Uri "$target/api/health" -UseBasicParsing -TimeoutSec 1 | Out-Null
            Start-Process $target
            break
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
} -ArgumentList $url
try {
    & $python -m uvicorn app.main:app --app-dir (Join-Path $root "backend") --host 127.0.0.1 --port $settings.port
}
finally {
    Stop-Job $opener -ErrorAction SilentlyContinue
    Remove-Job $opener -Force -ErrorAction SilentlyContinue
}
