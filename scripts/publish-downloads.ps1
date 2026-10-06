# Publishes the app downloads of BOTH sites to the orphan branch `downloads` of origin:
#   fomo.spot:           FOMO.apk, FOMO-Setup.exe, FOMO.dmg (macOS, optional)
#   terminal.fomo.spot:  FOMO-Terminal.apk, FOMO-Terminal-Setup.exe, FOMO-Terminal.dmg (macOS, optional)
#   plus manifest.json.
#
# Why a branch and not the main history: the binaries are 1.5 MB (APK) and ~94 MB (Windows installer). A fresh
# single-commit orphan branch that is force-pushed every time keeps the repository from collecting binary history
# (old commits become unreachable and GitHub drops them). The server checks the branch out into public/app/dl/
# (see docs/downloads.md); the main branch never contains the binaries (public/app/dl/ is in .gitignore).
#
# Usage (PowerShell 5.1+):
#   scripts\publish-downloads.ps1 -Dry                       # everything except the push
#   scripts\publish-downloads.ps1                            # build the temp repo and force-push `downloads`
#   scripts\publish-downloads.ps1 -RefreshManifest -Dry      # recount sizes / sha256 (versions come from the old manifest)
#   scripts\publish-downloads.ps1 -RefreshManifest -AndroidVersion 1.0.1 -AndroidVersionCode 2 -WindowsVersion 1.0.1 `
#       -TerminalAndroidVersion 1.0.1 -TerminalAndroidVersionCode 2 -TerminalWindowsVersion 1.0.1 -Dry
#
# Inputs: -Folder (default C:\Users\viptd\tools\downloads) holds the files above plus manifest.json:
#   {"android":{"file","version","versionCode","size","sha256"},"windows":{...},"macos":{...}?,
#    "terminal":{"android":{...},"windows":{...},"macos":{...}?},"updated"}
# The two APKs and the two Windows installers are required. A macOS .dmg is optional: no file -> no `macos` entry in
# dl-info.json -> no macOS tile on that site (the site shows only what exists). A .dmg over the GitHub limit (a universal
# Electron app is more than 100 MB) is NOT put in the branch: copy it to the server with scp (the script prints the command).
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
  [string]$WindowsVersion,
  [string]$MacVersion,
  [string]$TerminalAndroidVersion,
  [int]$TerminalAndroidVersionCode = 0,
  [string]$TerminalWindowsVersion,
  [string]$TerminalMacVersion
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

# What the folder may hold. site = main | terminal, key = android | windows | macos (the manifest / dl-info name).
$entries = @(
  @{ site = "main";     key = "android"; file = "FOMO.apk";                    required = $true;  version = $AndroidVersion;         code = $AndroidVersionCode }
  @{ site = "main";     key = "windows"; file = "FOMO-Setup.exe";              required = $true;  version = $WindowsVersion;         code = 0 }
  @{ site = "main";     key = "macos";   file = "FOMO.dmg";                    required = $false; version = $MacVersion;             code = 0 }
  @{ site = "terminal"; key = "android"; file = "FOMO-Terminal.apk";           required = $true;  version = $TerminalAndroidVersion; code = $TerminalAndroidVersionCode }
  @{ site = "terminal"; key = "windows"; file = "FOMO-Terminal-Setup.exe";     required = $true;  version = $TerminalWindowsVersion; code = 0 }
  @{ site = "terminal"; key = "macos";   file = "FOMO-Terminal.dmg";           required = $false; version = $TerminalMacVersion;     code = 0 }
)
$man = Join-Path $Folder "manifest.json"
foreach ($e in $entries) {
  $e.path = Join-Path $Folder $e.file
  $e.present = Test-Path -LiteralPath $e.path
  $e.label = if ($e.site -eq "main") { $e.key } else { "terminal.$($e.key)" }
  if ($e.required -and -not $e.present) { Fail "missing $($e.path)" }
}

# the folder must hold exactly these files (nothing else may leak into a public branch)
$allowed = @($entries | ForEach-Object { $_.file }) + "manifest.json"
$extra = Get-ChildItem -LiteralPath $Folder -Force | Where-Object { $allowed -notcontains $_.Name }
if ($extra) { Fail ("unexpected files in " + $Folder + ": " + (($extra | ForEach-Object { $_.Name }) -join ", ")) }

# the manifest entry of one file (terminal ones live under `terminal`)
function Get-ManifestEntry($m, $e) {
  if (-not $m) { return $null }
  if ($e.site -eq "main") { return $m.($e.key) }
  if (-not $m.terminal) { return $null }
  return $m.terminal.($e.key)
}

if ($RefreshManifest) {
  $old = $null
  if (Test-Path -LiteralPath $man) { $old = Get-Content -LiteralPath $man -Raw -Encoding UTF8 | ConvertFrom-Json }
  $manifest = [ordered]@{}
  $terminal = [ordered]@{}
  foreach ($e in $entries) {
    if (-not $e.present) { continue }
    $o = Get-ManifestEntry $old $e
    $ver = if ($e.version) { $e.version } elseif ($o -and $o.version) { $o.version } else { Fail "version of $($e.label) is required (see the -...Version parameters)" }
    $item = [ordered]@{ file = $e.file; version = $ver }
    if ($e.key -eq "android") {
      $code = if ($e.code -gt 0) { $e.code } elseif ($o -and $o.versionCode) { [int]$o.versionCode } else { Fail "versionCode of $($e.label) is required" }
      $item.versionCode = $code
    }
    $item.size = (Get-Item -LiteralPath $e.path).Length
    $item.sha256 = (Sha256 $e.path)
    if ($e.site -eq "main") { $manifest[$e.key] = $item } else { $terminal[$e.key] = $item }
  }
  $manifest["terminal"] = $terminal
  $manifest["updated"] = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  WriteJson $man $manifest
  Write-Host "manifest.json refreshed"
}

if (-not (Test-Path -LiteralPath $man)) { Fail "missing manifest.json (run with -RefreshManifest and the version parameters)" }
$m = Get-Content -LiteralPath $man -Raw -Encoding UTF8 | ConvertFrom-Json

# manifest must describe the files that are actually in the folder (and only those)
$problems = @()
$oversize = @()
foreach ($e in $entries) {
  $me = Get-ManifestEntry $m $e
  if (-not $e.present) {
    if ($me) { $problems += "$($e.label): the manifest lists $($e.file) but the file is not in the folder" }
    continue
  }
  $len = (Get-Item -LiteralPath $e.path).Length
  if (-not $me) { $problems += "$($e.label): entry missing"; continue }
  if ($me.file -ne $e.file) { $problems += "$($e.label): file name $($me.file)" }
  if ([int64]$me.size -ne $len) { $problems += "$($e.label): size $($me.size) != $len" }
  if ($me.sha256 -ne (Sha256 $e.path)) { $problems += "$($e.label): sha256 differs" }
  if (-not $me.version) { $problems += "$($e.label): version missing" }
  if ($e.key -eq "android" -and -not $me.versionCode) { $problems += "$($e.label): versionCode missing" }
  if ($len -gt $maxBytes) {
    if ($e.key -eq "macos") { $oversize += $e } else { $problems += "$($e.label): $len bytes is over the GitHub file limit" }
  }
}
if (-not $m.updated) { $problems += "updated missing" }
if ($problems) { Fail ("manifest check failed: " + ($problems -join "; ")) }
foreach ($e in $entries) {
  if ($e.present) { $me = Get-ManifestEntry $m $e; Write-Host ("{0,-17} {1,-8} {2,12:N0} bytes  {3}" -f $e.label, $me.version, $me.size, $e.file) }
  else { Write-Host ("{0,-17} (no file: no tile on the site)" -f $e.label) }
}

# a hard stop for anything that looks like signing material
foreach ($f in (Get-ChildItem -LiteralPath $Folder -Force)) {
  if ($f.Name -match '\.(jks|keystore|pem|p12|properties|env)$') { Fail "refusing to publish $($f.Name)" }
}

# public/app/dl-info.json: what the site shows next to the buttons (versions and sizes only; hashes stay on the branch).
# An absent entry (macOS without a file) is what keeps the tile off the page.
function InfoItem($e) {
  $me = Get-ManifestEntry $m $e
  $item = [ordered]@{ version = $me.version }
  if ($e.key -eq "android") { $item.versionCode = [int]$me.versionCode }
  $item.size = [int64]$me.size
  return $item
}
$info = [ordered]@{}
$tinfo = [ordered]@{}
foreach ($e in $entries) {
  if (-not $e.present) { continue }
  if ($e.site -eq "main") { $info[$e.key] = InfoItem $e } else { $tinfo[$e.key] = InfoItem $e }
}
$info["terminal"] = $tinfo
$info["updated"] = $m.updated
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
$inBranch = @()
foreach ($e in $entries) {
  if (-not $e.present) { continue }
  if ($oversize -contains $e) { continue }
  Copy-Item -LiteralPath $e.path -Destination $WorkDir
  $inBranch += $e.file
}
Copy-Item -LiteralPath $man -Destination $WorkDir
$inBranch += "manifest.json"

function Invoke-Git { & git -C $WorkDir @args; if ($LASTEXITCODE -ne 0) { Fail "git $($args -join ' ') failed" } }
Invoke-Git init -q -b $Branch
Invoke-Git config user.name $name
Invoke-Git config user.email $mail
Invoke-Git config core.autocrlf false
Invoke-Git remote add origin $Remote
# the marker file stays out of the commit
Add-Content -LiteralPath (Join-Path $WorkDir ".git\info\exclude") -Value ".fomo-downloads-repo"
Invoke-Git add -- @inBranch
$msg = "Downloads: FOMO Android {0} / Windows {1}; Terminal Android {2} / Windows {3} ({4})" -f $m.android.version, $m.windows.version, $m.terminal.android.version, $m.terminal.windows.version, $m.updated
Invoke-Git commit -q -m $msg
Invoke-Git ls-tree -r --long HEAD

foreach ($e in $oversize) {
  Write-Host ("NOTE: {0} ({1:N0} bytes) is over the GitHub limit and is NOT in the branch. Copy it to the server by hand BEFORE deploying the site (its tile appears from dl-info.json):" -f $e.file, (Get-Item -LiteralPath $e.path).Length) -ForegroundColor Yellow
  $dir = if ($e.site -eq "main") { "/opt/fomo" } else { "/opt/fomo-terminal" }
  Write-Host ("  scp `"{0}`" <server>:{1}/public/app/dl/{2}" -f $e.path, $dir, $e.file) -ForegroundColor Yellow
}

if ($Dry) {
  Write-Host "DRY RUN: nothing pushed. Would run: git push --force origin ${Branch}:${Branch} (from $WorkDir)" -ForegroundColor Yellow
  exit 0
}
Invoke-Git push --force origin "${Branch}:${Branch}"
Write-Host "pushed $Branch to $Remote" -ForegroundColor Green
