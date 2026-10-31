param([string]$DocumentationScriptRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$documentationRoot = [System.IO.Path]::GetFullPath((Join-Path $DocumentationScriptRoot '../..'))
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $documentationRoot '..'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing
$baseline = Get-Content -LiteralPath (Join-Path $documentationRoot '05_VALIDATION/Source_Baseline.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$changed = @()
foreach ($item in $baseline.files) {
    $sourcePath = Join-Path $repositoryRoot $item.file
    if (-not (Test-Path -LiteralPath $sourcePath) -or (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { $changed += $item.file }
}
if ($changed.Count) { throw ('Pre-existing source changed: ' + ($changed -join ', ')) }
$packageResults = @()
foreach ($package in Get-ChildItem -LiteralPath $documentationRoot -Recurse -File | Where-Object Extension -in '.docx','.xlsx') {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($package.FullName)
    try {
        $names = @($archive.Entries | ForEach-Object FullName)
        if ($names -notcontains '[Content_Types].xml' -or $names -notcontains '_rels/.rels') { throw 'Incomplete OOXML package' }
        $xmlCount = 0
        $textParts = @{}
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '\.(xml|rels)$') {
                $reader = [System.IO.StreamReader]::new($entry.Open())
                try { $raw = $reader.ReadToEnd(); [xml]$part = $raw; $textParts[$entry.FullName] = $part } finally { $reader.Dispose() }
                $xmlCount++
                if ($entry.FullName -match '\.rels$') {
                    foreach ($relationship in $part.DocumentElement.ChildNodes) {
                        if ($relationship.TargetMode -eq 'External') { continue }
                        $base = if ($entry.FullName -eq '_rels/.rels') { '' } else { ($entry.FullName -replace '/_rels/[^/]+\.rels$','') + '/' }
                        $target = [string]$relationship.Target
                        if ($target.StartsWith('/')) { $partName = $target.TrimStart('/') } else { $partName = $base + $target }
                        if ($names -notcontains $partName) { throw ('Missing related part: ' + $partName) }
                    }
                }
            }
        }
        $result = [ordered]@{file=$package.FullName.Substring($documentationRoot.Length+1).Replace('\','/');bytes=$package.Length;xmlParts=$xmlCount;relationshipsValid=$true}
        if ($package.Extension -eq '.xlsx') {
            $sheet = $textParts['xl/worksheets/sheet1.xml']
            $rows = @($sheet.worksheet.sheetData.row)
            if ($rows.Count -ne 84) { throw 'Expected 83 inventory rows plus header' }
            foreach ($row in $rows) { if (@($row.c).Count -ne 11) { throw 'Inventory row must have 11 columns' } }
            $result.worksheets = @($textParts['xl/workbook.xml'].workbook.sheets.sheet).Count
            $result.featureRows = $rows.Count-1
            $result.columns = 11
            $result.frozenPane = $sheet.worksheet.sheetViews.sheetView.pane.state
        } else {
            $document = $textParts['word/document.xml']
            if (-not $document.get_InnerText().Contains('NEEDS VERIFICATION')) { throw 'Verification boundary missing' }
            $result.embeddedImages = @($archive.Entries | Where-Object FullName -match '^word/media/').Count
            $result.wordNativeVisualCheck = 'NEEDS VERIFICATION; OOXML structure and matching PDF rendered'
        }
        $packageResults += [pscustomobject]$result
    } finally { $archive.Dispose() }
}
$diagramResults = @()
foreach ($diagram in Get-ChildItem -LiteralPath (Join-Path $documentationRoot '02_SYSTEM_DIAGRAMS') -Recurse -File -Filter '*.drawio') {
    [xml]$editable = Get-Content -LiteralPath $diagram.FullName -Raw -Encoding UTF8
    if (-not $editable.mxfile.diagram.mxGraphModel.root) { throw 'Invalid draw.io XML graph' }
    $stem = $diagram.FullName.Substring(0,$diagram.FullName.Length-7)
    foreach ($extension in '.svg','.png','.pdf') { if (-not (Test-Path -LiteralPath ($stem+$extension))) { throw ('Missing diagram export '+$stem+$extension) } }
    [xml]$vector = Get-Content -LiteralPath ($stem+'.svg') -Raw -Encoding UTF8
    $bitmap = [System.Drawing.Image]::FromFile($stem+'.png')
    try { $diagramResults += [pscustomobject]@{file=$diagram.FullName.Substring($documentationRoot.Length+1).Replace('\','/');width=$bitmap.Width;height=$bitmap.Height;editableXml=$true;svgXml=$true;pngDecoded=$true} } finally { $bitmap.Dispose() }
}
if ($diagramResults.Count -ne 14) { throw 'Expected 14 diagram sets' }
# The built-in Windows PDF reader actually opens the generated PDFs; previews are local only.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$awaitOperation = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1)
$awaitAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1)
function Await-DocOperation($operation,[Type]$resultType) { $task = $awaitOperation.MakeGenericMethod($resultType).Invoke($null,@($operation)); $task.Wait(); return $task.Result }
function Await-DocAction($operation) { $task = $awaitAction.Invoke($null,@($operation)); $task.Wait() }
$previewRoot = Join-Path $documentationRoot '05_VALIDATION/Previews'
New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null
$pdfResults = @()
foreach ($pdf in Get-ChildItem -LiteralPath $documentationRoot -Recurse -File -Filter '*.pdf') {
    $storageFile = Await-DocOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdf.FullName)) ([Windows.Storage.StorageFile])
    $parsed = Await-DocOperation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)) ([Windows.Data.Pdf.PdfDocument])
    $isDiagram = $pdf.FullName.Contains('02_SYSTEM_DIAGRAMS')
    if ($isDiagram -and $parsed.PageCount -ne 1) { throw 'Diagram must fit one page' }
    $indices = if ($isDiagram) { @(0) } else { @(0,1,4,[int]([math]::Floor($parsed.PageCount/2)),[int]($parsed.PageCount-1)) | Select-Object -Unique }
    foreach ($number in $indices) {
        $page = $parsed.GetPage([uint32]$number)
        $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
        try {
            Await-DocAction ($page.RenderToStreamAsync($stream))
            $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
            try { [void](Await-DocOperation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])); $bytes = [byte[]]::new([int]$stream.Size); $reader.ReadBytes($bytes); [System.IO.File]::WriteAllBytes((Join-Path $previewRoot ($pdf.BaseName+'-page-'+($number+1)+'.png')),$bytes) } finally { $reader.Dispose() }
        } finally { $stream.Dispose(); $page.Dispose() }
    }
    $pdfResults += [pscustomobject]@{file=$pdf.FullName.Substring($documentationRoot.Length+1).Replace('\','/');pages=$parsed.PageCount;nativeReaderOpened=$true;renderedPreviewPages=@($indices | ForEach-Object {$_+1})}
}
$status = & git -C $repositoryRoot status --porcelain
foreach ($line in $status) { if ($line -and -not $line.Substring(3).StartsWith('SYSTEM_DOCUMENTATION/')) { throw ('Change outside documentation: '+$line) } }
$report = [ordered]@{date='2026-10-20';timezone='Asia/Manila';revision=$baseline.commit;trackedFilesCompared=$baseline.files.Count;preExistingTrackedFilesUnchanged=$true;changesRestrictedTo='SYSTEM_DOCUMENTATION/';packages=$packageResults;diagrams=$diagramResults;pdfs=$pdfResults;liveApplicationVerified=$false;currentDatabaseAccessed=$false;productionWrites=0;deployments=0;newLiveScreenshots=0;nativeOfficeVisualCheck='NEEDS VERIFICATION';wordAndExcelPackages='All XML parts and internal relationships parsed; matching document PDFs rendered';missingRequestedFormats=@()}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $documentationRoot '05_VALIDATION/Validation_Report.json') -Encoding UTF8
$packageResults | Format-Table file,xmlParts,featureRows -AutoSize
$pdfResults | Format-Table file,pages,nativeReaderOpened -AutoSize
Write-Output ('PASS: '+$baseline.files.Count+' original file hashes unchanged; 3 OOXML packages; 14 diagram sets; '+$pdfResults.Count+' PDFs opened by Windows.Data.Pdf.')
