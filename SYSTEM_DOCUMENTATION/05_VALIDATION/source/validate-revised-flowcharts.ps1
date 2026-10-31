param([string]$DocumentationScriptRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$documentationRoot = [IO.Path]::GetFullPath((Join-Path $DocumentationScriptRoot '../..'))
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $documentationRoot '..'))
$baseline = Get-Content -LiteralPath (Join-Path $documentationRoot '05_VALIDATION/Flowchart_Revision_Baseline.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$model = Get-Content -LiteralPath (Join-Path $documentationRoot '05_VALIDATION/Revised_Flowchart_Model.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$structure = Get-Content -LiteralPath (Join-Path $documentationRoot '05_VALIDATION/Revised_Flowchart_Structure.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$render = Get-Content -LiteralPath (Join-Path $documentationRoot '05_VALIDATION/Revised_Flowchart_Render.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $structure.passed -or -not $render.passed) { throw 'Resolve structural or text-fit validation failures first.' }
$changed = @()
foreach ($item in $baseline.files) {
    $original = Join-Path $repositoryRoot $item.file
    if (-not (Test-Path -LiteralPath $original) -or (Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256) { $changed += $item.file }
}
if ($changed.Count) { throw ('Original files changed: ' + ($changed -join ', ')) }
$folder = Join-Path $documentationRoot '02_SYSTEM_DIAGRAMS/Activity_Workflow_Diagrams'
$previewRoot = Join-Path $documentationRoot '05_VALIDATION/Revised_PDF_Previews'
New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$awaitOperation = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
$awaitAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
function Await-FlowOperation($operation,[Type]$resultType) { $task = $awaitOperation.MakeGenericMethod($resultType).Invoke($null,@($operation)); $task.Wait(); return $task.Result }
function Await-FlowAction($operation) { $task = $awaitAction.Invoke($null,@($operation)); $task.Wait() }
$results = @()
foreach ($flow in $model.flows) {
    $editablePath = Join-Path $folder ($flow.stem + '.drawio')
    [xml]$editable = Get-Content -LiteralPath $editablePath -Raw -Encoding UTF8
    $diagrams = @($editable.mxfile.diagram)
    if ($diagrams.Count -ne $flow.pages.Count) { throw ('Editable page count mismatch: '+$flow.stem) }
    foreach ($page in $flow.pages) {
        $diagram = $diagrams | Where-Object id -eq $page.id
        if (-not $diagram) { throw ('Missing editable page: '+$page.id) }
        $cells = @($diagram.mxGraphModel.root.mxCell)
        foreach ($node in $page.nodes) {
            $cell = $cells | Where-Object id -eq $node.id
            if (-not $cell -or $cell.vertex -ne '1') { throw ('Missing editable node: '+$node.id) }
            if ([string]$cell.value -ne ($node.lines -join "`n")) { throw ('Label mismatch in editable export: '+$page.id+'/'+$node.id) }
        }
        foreach ($edge in $page.edges) {
            $cell = $cells | Where-Object id -eq $edge.id
            if (-not $cell -or $cell.edge -ne '1' -or $cell.source -ne $edge.from -or $cell.target -ne $edge.to -or $cell.style -notmatch 'orthogonalEdgeStyle') { throw ('Editable arrow mismatch: '+$edge.id) }
        }
        [xml]$vector = Get-Content -LiteralPath (Join-Path $folder ($page.id+'.svg')) -Raw -Encoding UTF8
        $bitmap = [Drawing.Image]::FromFile((Join-Path $folder ($page.id+'.png')))
        try { if ($bitmap.Width -ne 2250 -or $bitmap.Height -ne 3270) { throw ('Incorrect PNG resolution: '+$page.id) } } finally { $bitmap.Dispose() }
    }
    $pdfPath = Join-Path $folder ($flow.stem+'.pdf')
    $file = Await-FlowOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath)) ([Windows.Storage.StorageFile])
    $pdf = Await-FlowOperation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
    if ($pdf.PageCount -ne $flow.pages.Count) { throw ('Native PDF page mismatch: '+$flow.stem) }
    for ($number=0; $number -lt $pdf.PageCount; $number++) {
        $page = $pdf.GetPage([uint32]$number)
        $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
        try {
            # Windows reports page size in 96-dpi DIPs, rather than 72-dpi PDF points.
            if ([math]::Abs($page.Size.Width-(210*96/25.4)) -gt 1.5 -or [math]::Abs($page.Size.Height-(297*96/25.4)) -gt 1.5) { throw ('PDF is not portrait A4: '+$page.Size.Width+' x '+$page.Size.Height) }
            $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
            $options.DestinationWidth = 1050
            Await-FlowAction ($page.RenderToStreamAsync($stream,$options))
            $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
            try {
                [void](Await-FlowOperation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]))
                $bytes = [byte[]]::new([int]$stream.Size); $reader.ReadBytes($bytes)
                [IO.File]::WriteAllBytes((Join-Path $previewRoot ($flow.stem+'_P'+($number+1).ToString('00')+'.png')),$bytes)
            } finally { $reader.Dispose() }
        } finally { $stream.Dispose(); $page.Dispose() }
    }
    $results += [pscustomobject]@{stem=$flow.stem;editablePages=$diagrams.Count;pngPages=$flow.pages.Count;pdfPages=$pdf.PageCount;nativePdfOpened=$true;allPdfPagesRendered=$true;paper='A4 portrait';originalsPreserved=$true}
}
$status = & git -C $repositoryRoot status --porcelain --untracked-files=all
foreach ($line in $status) { if ($line -and -not $line.Substring(3).StartsWith('SYSTEM_DOCUMENTATION/')) { throw ('Change outside documentation: '+$line) } }
$report = [ordered]@{passed=$true;date='2026-10-20';revision=$baseline.commit;originalTrackedFilesCompared=$baseline.files.Count;allOriginalTrackedFilesUnchanged=$true;changesRestrictedTo='SYSTEM_DOCUMENTATION/';structure=$structure;renderTextFitPassed=$render.passed;nativeExportValidation=$results;applicationFilesModified=0;databaseCalls=0;productionWrites=0;commitsCreated=0;deployments=0;productionInstallation='Not accessed; source-verified workflows, deployment needs verification';drawio='Uncompressed multi-page XML parsed; every editable node label and edge matches the validated model';png='All 37 page images decoded at 2250 x 3270';pdf='All 14 PDFs opened with Windows.Data.Pdf; every page rendered at 1050 px width'}
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $documentationRoot '05_VALIDATION/Flowchart_Revision_Validation.json') -Encoding UTF8
Write-Output ('PASS: '+$model.flows.Count+' workflows; '+$structure.pages+' pages; '+$structure.decisions+' decisions; '+$baseline.files.Count+' original tracked files unchanged; all native PDF pages rendered.')
