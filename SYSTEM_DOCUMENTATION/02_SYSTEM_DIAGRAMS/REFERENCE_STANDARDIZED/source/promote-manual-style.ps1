param([switch]$WorkspaceOnly,[switch]$ExternalOnly)
$ErrorActionPreference = 'Stop'
$flowRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$plan = Get-Content -LiteralPath (Join-Path $flowRoot 'validation\A4_Copy_Plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$review = Get-Content -LiteralPath (Join-Path $flowRoot 'validation\manual-style-pdf-review\PDF_Validation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $review.passed) { throw 'PDF validation must pass before copying.' }
$stamp = '20261023_A4_Formatting'
$backupRoot = Join-Path $flowRoot ('backups\' + $stamp)
$log = @()
foreach ($entry in $plan.entries) {
    $destination = [IO.Path]::GetFullPath($entry.target)
    $source = [IO.Path]::GetFullPath($entry.source)
    $isWorkspace = $destination.StartsWith($flowRoot + '\', [StringComparison]::OrdinalIgnoreCase)
    if (($WorkspaceOnly -and -not $isWorkspace) -or ($ExternalOnly -and $isWorkspace)) { continue }
    $permitted = $false
    foreach ($allowedRoot in $plan.roots.PSObject.Properties.Value) {
        $absoluteRoot = [IO.Path]::GetFullPath($allowedRoot).TrimEnd('\')
        if ($destination.StartsWith($absoluteRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { $permitted = $true; break }
    }
    if (-not $permitted -or -not $source.StartsWith($flowRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw ('Unexpected copy path: ' + $destination) }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw ('Source changed after plan: ' + $source) }
    $before = $null
    if (Test-Path -LiteralPath $destination) {
        $before = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
        # Preserve every editable diagram/PDF and prior README. Preview exports are reproducible.
        if ($destination -match '\.(drawio|pdf)$' -or [IO.Path]::GetFileName($destination) -eq 'README.md') {
            $rootPrefix = if ($isWorkspace) { $flowRoot } elseif ($entry.backupGroup -eq 'external-package') { [IO.Path]::GetFullPath($plan.roots.external) } elseif ($entry.backupGroup -eq 'manual-references') { [IO.Path]::GetFullPath($plan.roots.manual) } else { [IO.Path]::GetFullPath($plan.roots.downloads) }
            $relative = $destination.Substring($rootPrefix.TrimEnd('\').Length).TrimStart('\')
            $backup = Join-Path $backupRoot ($entry.backupGroup + '\' + $relative)
            if (-not (Test-Path -LiteralPath $backup)) { New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null; Copy-Item -LiteralPath $destination -Destination $backup }
        }
    }
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
    $after = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($after -ne $entry.sha256) { throw ('Copy verification failed: ' + $destination) }
    $log += [pscustomobject]@{ file=$destination; previousSha256=$before; sha256=$after; verified=$true }
}
$logFile = Join-Path $flowRoot ('validation\A4_Installed_' + $(if ($WorkspaceOnly) {'Workspace'} elseif ($ExternalOnly) {'External'} else {'All'}) + '.json')
$log | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $logFile -Encoding UTF8
Write-Output ('Copied and hash-verified ' + $log.Count + ' files. Backups: ' + $backupRoot)
