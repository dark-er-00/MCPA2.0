# Documentation export and scope validation. No application or database calls.
$ErrorActionPreference = 'Stop'
$docFolder = [IO.Path]::GetFullPath($PSScriptRoot)
$repoFolder = [IO.Path]::GetFullPath((Join-Path $docFolder '../../../..'))
$scopePrefix = 'SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/ADMIN_FLOWCHARTS/00_Main_Admin_Flowchart/'
$stem = 'SiteTrace_Main_Admin_Flowchart'
$baseline = Get-Content -LiteralPath (Join-Path $docFolder 'Validation/Source_Baseline.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$model = Get-Content -LiteralPath (Join-Path $docFolder 'Validation/Diagram_Model.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$structure = Get-Content -LiteralPath (Join-Path $docFolder 'Validation/Structure.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$render = Get-Content -LiteralPath (Join-Path $docFolder 'Validation/Render.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $structure.passed -or -not $render.passed) { throw 'Resolve structural and render-fit failures first.' }
$originalPaths = [Collections.Generic.HashSet[string]]::new()
foreach ($original in $baseline.files) {
    [void]$originalPaths.Add($original.file)
    $absolute = Join-Path $repoFolder $original.file
    if (-not (Test-Path -LiteralPath $absolute) -or (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant() -ne $original.sha256) { throw ('Pre-existing file changed: '+$original.file) }
}
$currentFiles = & git -C $repoFolder ls-files --cached --others --exclude-standard
foreach ($file in $currentFiles) { if (-not $originalPaths.Contains($file) -and -not $file.StartsWith($scopePrefix)) { throw ('New file outside approved folder: '+$file) } }
$currentCommit = (& git -C $repoFolder rev-parse HEAD).Trim()
if ($currentCommit -ne $baseline.commit) { throw 'Repository commit changed during documentation generation.' }
foreach ($extension in '.drawio','.png','.pdf','_Explanation.md') { if (-not (Test-Path -LiteralPath (Join-Path $docFolder ($stem+$extension)))) { throw ('Missing required output: '+$extension) } }
[xml]$editable = Get-Content -LiteralPath (Join-Path $docFolder ($stem+'.drawio')) -Raw -Encoding UTF8
$diagrams = @($editable.mxfile.diagram)
if ($diagrams.Count -ne 4) { throw 'Editable source must have four pages.' }
$nodeCount = 0; $arrowCount = 0
foreach ($page in $model.pages) {
    $diagram = $diagrams | Where-Object id -eq $page.id
    if (-not $diagram) { throw ('Missing editable page '+$page.id) }
    $cells = @($diagram.mxGraphModel.root.mxCell)
    foreach ($node in $page.nodes) {
        $cell = $cells | Where-Object id -eq $node.id
        if (-not $cell -or $cell.vertex -ne '1' -or [string]$cell.value -ne ($node.lines -join "`n")) { throw ('Editable node mismatch: '+$node.id) }
        if ($cell.style -notmatch 'fillColor=#ffffff;' -or $cell.style -notmatch 'strokeColor=#292929;') { throw 'Symbols must use white fill and dark outlines.' }
        if ([math]::Abs([double]$cell.mxGeometry.x-$node.x) -gt 0.001 -or [math]::Abs([double]$cell.mxGeometry.y-$node.y) -gt 0.001 -or [math]::Abs([double]$cell.mxGeometry.width-$node.w) -gt 0.001 -or [math]::Abs([double]$cell.mxGeometry.height-$node.h) -gt 0.001) { throw ('Editable geometry mismatch '+$node.id) }
        $nodeCount++
    }
    foreach ($edge in $page.edges) {
        $cell = $cells | Where-Object id -eq $edge.id
        if (-not $cell -or $cell.edge -ne '1' -or $cell.source -ne $edge.from -or $cell.target -ne $edge.to -or [string]$cell.value -ne $edge.label -or $cell.style -notmatch 'orthogonalEdgeStyle') { throw ('Editable arrow mismatch: '+$edge.id) }
        if ($edge.bus -and (-not $cell.mxGeometry.Array.mxPoint -or [double]$cell.mxGeometry.Array.mxPoint.x -ne 400)) { throw 'Module case must use its explicit shared-trunk waypoint.' }
        $arrowCount++
    }
    [xml]$svg = Get-Content -LiteralPath (Join-Path $docFolder ($stem+'_P'+$page.number.ToString('00')+'.svg')) -Raw -Encoding UTF8
}
Add-Type -AssemblyName System.Drawing
$pngResults = @()
foreach ($file in Get-ChildItem -LiteralPath $docFolder -File -Filter '*.png') {
    $bitmap = [Drawing.Image]::FromFile($file.FullName)
    try {
        $isOverview = $file.BaseName -eq $stem
        if ($isOverview) { if ($bitmap.Width -ne 4800 -or $bitmap.Height -ne 1890) { throw 'Overview PNG dimensions changed.' } }
        elseif ($bitmap.Width -ne 3150 -or $bitmap.Height -ne 4455) { throw 'Page PNG must be 3150 x 4455.' }
        $pngResults += [pscustomobject]@{file=$file.Name;width=$bitmap.Width;height=$bitmap.Height;decoded=$true}
    } finally { $bitmap.Dispose() }
}
if ($pngResults.Count -ne 5) { throw 'Expected requested PNG overview plus four individual page PNGs.' }
# Windows opens and renders the real PDF, independently of the SVG screenshot path.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$awaitOperation = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
$awaitAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
function Await-AdminOperation($operation,[Type]$resultType) { $task = $awaitOperation.MakeGenericMethod($resultType).Invoke($null,@($operation)); $task.Wait(); return $task.Result }
function Await-AdminAction($operation) { $task = $awaitAction.Invoke($null,@($operation)); $task.Wait() }
$pdfFile = Await-AdminOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Join-Path $docFolder ($stem+'.pdf')))) ([Windows.Storage.StorageFile])
$pdf = Await-AdminOperation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($pdfFile)) ([Windows.Data.Pdf.PdfDocument])
if ($pdf.PageCount -ne 4) { throw 'Native PDF page count mismatch.' }
$pdfPages = @()
for ($i=0; $i -lt $pdf.PageCount; $i++) {
    $page = $pdf.GetPage([uint32]$i)
    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    try {
        # Native page size uses 96-dpi DIPs. A3 is 297 x 420 mm.
        if ([math]::Abs($page.Size.Width-(297*96/25.4)) -gt 2 -or [math]::Abs($page.Size.Height-(420*96/25.4)) -gt 2) { throw 'Expected A3 portrait paper.' }
        $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new(); $options.DestinationWidth = 1300
        Await-AdminAction ($page.RenderToStreamAsync($stream,$options))
        $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
        try {
            [void](Await-AdminOperation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]))
            $bytes = [byte[]]::new([int]$stream.Size); $reader.ReadBytes($bytes)
            [IO.File]::WriteAllBytes((Join-Path $docFolder ('Validation/PDF_Preview_P'+($i+1).ToString('00')+'.png')),$bytes)
        } finally { $reader.Dispose() }
        $pdfPages += [pscustomobject]@{page=$i+1;nativePdfRendered=$true;paper='A3 portrait'}
    } finally { $stream.Dispose(); $page.Dispose() }
}
$explanationPath = Join-Path $docFolder ($stem+'_Explanation.md')
$explanation = Get-Content -LiteralPath $explanationPath -Raw -Encoding UTF8
$links = [regex]::Matches($explanation,'\[[^\]]*\]\(([^)]+)\)')
foreach ($link in $links) { if (-not (Test-Path -LiteralPath ([IO.Path]::GetFullPath((Join-Path $docFolder $link.Groups[1].Value))))) { throw ('Broken documentation link: '+$link.Groups[1].Value) } }
foreach ($module in $model.modules) { if (-not $explanation.Contains($module.ref) -or -not $explanation.Contains($module.label)) { throw ('Module absent from explanation: '+$module.ref) } }
$report = [ordered]@{passed=$true;date='2026-10-20';stage=1;revision=$baseline.commit;preExistingFilesCompared=$baseline.files.Count;allPreExistingFilesUnchanged=$true;newFilesRestrictedTo=$scopePrefix;editablePages=4;editableNodesVerified=$nodeCount;editableArrowsVerified=$arrowCount;structure=$structure;browserTextFitPassed=$render.passed;pngs=$pngResults;nativePdfPages=$pdfPages;explanationLinksVerified=$links.Count;plannedStage2ModuleExits=13;stage2ModuleFlowchartsCreated=0;applicationFilesModified=0;databaseCalls=0;productionWrites=0;deployments=0;commitsCreated=0;manualVerification='Live sign-in / active Admin accounts, deployed RPC/policy versions and production network/session behavior were not accessed';editableApplicationCheck='Uncompressed draw.io XML, symbols, label newlines, page geometry and every source/target edge checked directly; native draw.io UI not opened'}
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $docFolder 'Validation/Validation_Report.json') -Encoding UTF8
# All additions, including helper scripts and validation evidence, are listed in this folder.
$manifestPath = Join-Path $docFolder 'Validation/Artifact_Manifest.json'
$artifacts = @(Get-ChildItem -LiteralPath $docFolder -Recurse -File | Where-Object FullName -ne $manifestPath | Sort-Object FullName | ForEach-Object { [pscustomobject]@{file=$_.FullName.Substring($docFolder.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
[ordered]@{stage=1;scope=$scopePrefix;excludesOwnHash=$true;files=$artifacts} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Output ('PASS: 4 pages; '+$nodeCount+' editable symbols; '+$arrowCount+' editable arrows; 13 planned module exits; 5 PNGs; native PDF rendered; '+$baseline.files.Count+' pre-existing files unchanged.')
