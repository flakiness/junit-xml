# Set error handling to stop on any error
$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# This is a TEMPLATE. The release workflow renders it into install.ps1 by
# replacing {{RELEASE_BASE_URL}} with this release's download URL, so the
# uploaded installer always pins to the exact release it ships with.
# Running this template file directly will not work — use the published
# installer:
#   irm https://github.com/flakiness/junit-xml/releases/latest/download/install.ps1 | iex

# 1. Configuration
$BaseUrl = "{{RELEASE_BASE_URL}}"
$ToolName = "flakiness-junit-xml"
$InstallDir = "$env:LOCALAPPDATA\$ToolName"
$ExeName = "$ToolName.exe"

# 2. Determine Architecture (Only x64 supported by Bun on Windows for now)
if ([System.Environment]::Is64BitOperatingSystem) {
    $Target = "win-x64"
} else {
    Write-Error "This tool currently only supports 64-bit Windows."
    exit 1
}

# 3. Setup Installation Directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# 4. Download and Install
$Url = "$BaseUrl/$ToolName-$Target.exe.gz"
$GzPath = "$InstallDir\$ToolName.exe.gz"
$ExePath = "$InstallDir\$ExeName"

Write-Host "⬇️  Downloading $ToolName from $Url..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $Url -OutFile $GzPath

Write-Host "📦 Extracting..." -ForegroundColor Cyan

# Native GZIP decompression using .NET (No external tools needed)
try {
    $InStream = [System.IO.File]::OpenRead($GzPath)
    $OutStream = [System.IO.File]::Create($ExePath)
    $GzipStream = [System.IO.Compression.GZipStream]::new($InStream, [System.IO.Compression.CompressionMode]::Decompress)

    $GzipStream.CopyTo($OutStream)
}
finally {
    if ($GzipStream) { $GzipStream.Dispose() }
    if ($OutStream) { $OutStream.Dispose() }
    if ($InStream) { $InStream.Dispose() }
}

# Cleanup .gz file
Remove-Item $GzPath

# 5. Add to PATH (User Environment Variable)
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    Write-Host "🔧 Adding $InstallDir to User PATH..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    Write-Host "✅ Path updated. You may need to restart your terminal." -ForegroundColor Green
}
if ($env:GITHUB_PATH) {
    Write-Host "🤖 Detected GitHub Actions, updating GITHUB_PATH..." -ForegroundColor Cyan
    Add-Content -Path $env:GITHUB_PATH -Value $InstallDir
}

Write-Host "✅ $ToolName installed successfully!" -ForegroundColor Green
Write-Host "   Run it by typing: $ToolName" -ForegroundColor Gray
