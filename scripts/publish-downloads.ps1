# Publishes the app downloads (FOMO.apk, FOMO-Setup.exe, manifest.json) to the orphan branch `downloads` of origin.
#
# Why a branch and not the main history: the binaries are 1.5 MB (APK) and ~94 MB (Windows installer). A fresh
# single-commit orphan branch that is force-pushed every time keeps the repository from collecting binary history
# (old commits become unreachable and GitHub drops them). The server checks the branch out into public/app/dl/
# (see docs/downloads.md); the main branch never contains the binaries (public/app/dl/ is in .gitignore).
#
# Usage (PowerShell 5.1+):
#   scripts\publish-downloads.ps1 -Dry                       # everything except the push
#   scripts\publish-downloads.ps1                            # build the temp repo and force-push `downloads`
#   scripts\publish-downloads.ps1 -RefreshManifest -AndroidVersion 1.0.1 -AndroidVersionCode 2 -WindowsVersion 1.0.1 -Dry
#
# Inputs: -Folder (default C:\Users\viptd\tools\downloads) must hold exactly FOMO.apk and FOMO-Setup.exe plus manifest.json:
#   {"android":{"file","version","versionCode","size","sha256"},"windows":{"file","version","size","sha256"},"updated"}
# Side effect: rewrites public/app/dl-info.json (committed; the site reads sizes/versions from it, never hard-coded).
# The script never touches the signing keys and never prints secrets.

[CmdletBinding()]
param(
  [string]$Folder = "C:\Users\viptd\tools\downloads",
  [string]$WorkDir = "C:\Users\viptd\tools\downloads-repo",
  [string]$Remote = "",
  [string]$Branch = "downloads",
  [switch]$Dry,
  [switch]$RefreshManifest,
  [string]$AndroidVersion,
  [int]$AndroidVersionCode = 0,
  [string]$WindowsVersion
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$maxBytes = 99MB  # GitHub rejects files over 100 MiB
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
function Sha256([string]$p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower() }
function WriteJson([string]$path, $obj) {
  [System.IO.File]::WriteAllText($path, (($obj | ConvertTo-Json -Depth 6) + "`n"), $utf8)
}

if (-not (Test-Path -LiteralPath $Folder)) { Fail "folder not found: $Folder" }
$apk = Join-Path $Folder "FOMO.apk"
$exe = Join-Path $Folder "FOMO-Setup.exe"
$man = Join-Path $Folder "manifest.json"
foreach ($f in @($apk, $exe)) { if (-not (Test-Path -LiteralPath $f)) { Fail "missing $f" } }

# the folder must hold exactly these three files (nothing else may leak into a public branch)
$allowed = @("FOMO.apk", "FOMO-Setup.exe", "manifest.json")
$extra = Get-ChildItem -LiteralPath $Folder -Force | Where-Object { $allowed -notcontains $_.Name }
if ($extra) { Fail ("unexpected files in " + $Folder + ": " + (($extra | ForEach-Object { $_.Name }) -join ", ")) }

if ($RefreshManifest) {
  $old = $null
  if (Test-Path -LiteralPath $man) { $old = Get-Content -LiteralPath $man -Raw -Encoding UTF8 | ConvertFrom-Json }
  $av = if ($AndroidVersion) { $AndroidVersion } elseif ($old) { $old.android.version } else { Fail "-AndroidVersion is required" }
  $ac = if ($AndroidVersionCode -gt 0) { $AndroidVersionCode } elseif ($old) { [int]$old.android.versionCode } else { Fail "-AndroidVersionCode is required" }
  $wv = if ($WindowsVersion) { $WindowsVersion } elseif ($old) { $old.windows.version } else { Fail "-WindowsVersion is required" }
  $manifest = [ordered]@{
    android = [ordered]@{ file = "FOMO.apk"; version = $av; versionCode = $ac; size = (Get-Item -LiteralPath $apk).Length; sha256 = (Sha256 $apk) }
    windows = [ordered]@{ file = "FOMO-Setup.exe"; version = $wv; size = (Get-Item -LiteralPath $exe).Length; sha256 = (Sha256 $exe) }
    updated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  }
  WriteJson $man $manifest
  Write-Host "manifest.json refreshed"
}

if (-not (Test-Path -LiteralPath $man)) { Fail "missing manifest.json (run with -RefreshManifest and the version parameters)" }
$m = Get-Content -LiteralPath $man -Raw -Encoding UTF8 | ConvertFrom-Json

# manifest must describe the files that are actually in the folder
$problems = @()
foreach ($pair in @(@("android", $apk), @("windows", $exe))) {
  $e = $m.($pair[0]); $p = $pair[1]; $len = (Get-Item -LiteralPath $p).Length
  if (-not $e) { $problems += "$($pair[0]): entry missing"; continue }
  if ($e.file -ne (Split-Path -Leaf $p)) { $problems += "$($pair[0]): file name $($e.file)" }
  if ([int64]$e.size -ne $len) { $problems += "$($pair[0]): size $($e.size) != $len" }
  if ($e.sha256 -ne (Sha256 $p)) { $problems += "$($pair[0]): sha256 differs" }
  if (-not $e.version) { $problems += "$($pair[0]): version missing" }
  if ($len -gt $maxBytes) { $problems += "$($pair[0]): $len bytes is over the GitHub file limit" }
}
if (-not $m.android.versionCode) { $problems += "android: versionCode missing" }
if (-not $m.updated) { $problems += "updated missing" }
if ($problems) { Fail ("manifest check failed: " + ($problems -join "; ")) }
Write-Host ("android {0} (code {1}), {2:N0} bytes; windows {3}, {4:N0} bytes" -f $m.android.version, $m.android.versionCode, $m.android.size, $m.windows.version, $m.windows.size)

# a hard stop for anything that looks like signing material
foreach ($f in (Get-ChildItem -LiteralPath $Folder -Force)) {
  if ($f.Name -match '\.(jks|keystore|pem|p12|properties|env)$') { Fail "refusing to publish $($f.Name)" }
}

# public/app/dl-info.json: what the site shows next to the buttons (versions and sizes only; hashes stay on the branch)
$info = [ordered]@{
  android = [ordered]@{ version = $m.android.version; versionCode = [int]$m.android.versionCode; size = [int64]$m.android.size }
  windows = [ordered]@{ version = $m.windows.version; size = [int64]$m.windows.size }
  updated = $m.updated
}
$infoPath = Join-Path $repo "public\app\dl-info.json"
WriteJson $infoPath $info
Write-Host "wrote $infoPath (commit it to master)"

# --- temp repository with ONE orphan commit --------------------------------------------------------------------
if (-not $Remote) { $Remote = (& git -C $repo remote get-url origin).Trim() }
if (-not $Remote) { Fail "no remote url" }
$name = (& git -C $repo config user.name).Trim(); $mail = (& git -C $repo config user.email).Trim()
if (-not $name) { $name = "FOMO Developer" }; if (-not $mail) { $mail = "fomo@neurotrader.dev" }

if (Test-Path -LiteralPath $WorkDir) {
  # only ever delete a directory this script created
  if (-not (Test-Path -LiteralPath (Join-Path $WorkDir ".fomo-downloads-repo"))) { Fail "$WorkDir exists and is not a downloads-repo; remove it by hand" }
  Remove-Item -LiteralPath $WorkDir -Recurse -Force
}
New-Item -ItemType Directory -Path $WorkDir | Out-Null
Set-Content -LiteralPath (Join-Path $WorkDir ".fomo-downloads-repo") -Value "temporary repository for scripts/publish-downloads.ps1" -Encoding ascii
Copy-Item -LiteralPath $apk, $exe, $man -Destination $WorkDir

function Invoke-Git { & git -C $WorkDir @args; if ($LASTEXITCODE -ne 0) { Fail "git $($args -join ' ') failed" } }
Invoke-Git init -q -b $Branch
Invoke-Git config user.name $name
Invoke-Git config user.email $mail
Invoke-Git config core.autocrlf false
Invoke-Git remote add origin $Remote
# the marker file stays out of the commit
Add-Content -LiteralPath (Join-Path $WorkDir ".git\info\exclude") -Value ".fomo-downloads-repo"
Invoke-Git add -- FOMO.apk FOMO-Setup.exe manifest.json
Invoke-Git commit -q -m ("Downloads: Android {0} / Windows {1} ({2})" -f $m.android.version, $m.windows.version, $m.updated)
Invoke-Git ls-tree -r --long HEAD

if ($Dry) {
  Write-Host "DRY RUN: nothing pushed. Would run: git push --force origin ${Branch}:${Branch} (from $WorkDir)" -ForegroundColor Yellow
  exit 0
}
Invoke-Git push --force origin "${Branch}:${Branch}"
Write-Host "pushed $Branch to $Remote" -ForegroundColor Green
