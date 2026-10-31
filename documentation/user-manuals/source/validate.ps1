param([string]$DocumentationScriptRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
$documentationRoot = [System.IO.Path]::GetFullPath((Join-Path $DocumentationScriptRoot '..'))
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $DocumentationScriptRoot '../../..'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
$builds = Get-Content -LiteralPath (Join-Path $documentationRoot 'document-build.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $documentationRoot 'screenshot-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$baseline = Get-Content -LiteralPath (Join-Path $documentationRoot 'source-baseline.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$changedSources = @()
foreach ($property in $baseline.PSObject.Properties) {
    $filePath = Join-Path $repositoryRoot $property.Name
    if (-not (Test-Path -LiteralPath $filePath) -or (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $property.Value) { $changedSources += $property.Name }
}
if ($changedSources.Count -gt 0) { throw ('Application source changed: ' + ($changedSources -join ', ')) }
foreach ($shot in $manifest.screenshots) {
    $filePath = Join-Path $documentationRoot ('screenshots/' + $shot.filename)
    if ((Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $shot.sha256) { throw ('Screenshot hash mismatch: ' + $shot.filename) }
}
if ($manifest.browserBusinessWrites -ne 0 -or $manifest.uncaughtErrors -ne 0) { throw 'Capture safety assertions failed' }
$results = @()
foreach ($build in $builds) {
    $packagePath = Join-Path $documentationRoot ($build.stem + '.docx')
    $archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
    try {
        $xmlParts = 0
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '\.(xml|rels)$') {
                $reader = [System.IO.StreamReader]::new($entry.Open())
                try { $content = $reader.ReadToEnd(); $parsedXml = [System.Xml.XmlDocument]::new(); $parsedXml.LoadXml($content); $xmlParts++ } finally { $reader.Dispose() }
            }
        }
        $media = @($archive.Entries | Where-Object FullName -Match '^word/media/.*\.png$')
        if ($media.Count -ne $build.figures) { throw ('DOCX media count mismatch: ' + $build.stem) }
        $reader = [System.IO.StreamReader]::new($archive.GetEntry('word/document.xml').Open())
        try { [xml]$documentXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $manager = [System.Xml.XmlNamespaceManager]::new($documentXml.NameTable)
        $manager.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
        $manager.AddNamespace('r','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $manager.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
        $headings = $documentXml.SelectNodes('//w:pPr/w:pStyle[@w:val="Heading1"]', $manager).Count
        $anchors = @($documentXml.SelectNodes('//w:bookmarkStart', $manager) | ForEach-Object { $_.GetAttribute('name', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main') })
        foreach ($hyperlink in $documentXml.SelectNodes('//w:hyperlink', $manager)) { if ($anchors -notcontains $hyperlink.GetAttribute('anchor', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')) { throw 'Broken DOCX contents bookmark' } }
        $reader = [System.IO.StreamReader]::new($archive.GetEntry('word/_rels/document.xml.rels').Open())
        try { [xml]$relationships = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($relationship in $relationships.Relationships.Relationship) { if ($null -eq $archive.GetEntry('word/' + $relationship.Target)) { throw ('Broken DOCX relationship: ' + $relationship.Target) } }
        $reader = [System.IO.StreamReader]::new($archive.GetEntry('word/footer1.xml').Open())
        try { $footer = $reader.ReadToEnd() } finally { $reader.Dispose() }
        if ($footer -notmatch 'PAGE' -or $footer -notmatch 'NUMPAGES') { throw 'DOCX page fields missing' }
        $results += [pscustomobject]@{ stem=$build.stem; xmlPartsValidated=$xmlParts; embeddedPngs=$media.Count; heading1Count=$headings; contentsAnchorsValid=$true; pageFieldsPresent=$true; docxBytes=(Get-Item -LiteralPath $packagePath).Length }
    } finally { $archive.Dispose() }
}

# Windows PDFium renderer validates the emitted files and produces actual PDF-page
# previews, independently of the source HTML/browser print confirmation.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]
$operationAwaiter = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$actionAwaiter = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function Await-DocumentationOperation($operation, [Type]$resultType) { $operationTask = $operationAwaiter.MakeGenericMethod($resultType).Invoke($null, @($operation)); $operationTask.Wait(); return $operationTask.Result }
function Await-DocumentationAction($operation) { $operationTask = $actionAwaiter.Invoke($null, @($operation)); $operationTask.Wait() }
$previewRoot = Join-Path $documentationRoot 'source/pdf-previews'
New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null
foreach ($result in $results) {
    $pdfPath = Join-Path $documentationRoot ($result.stem + '.pdf')
    $pdfFile = Await-DocumentationOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($pdfPath)) ([Windows.Storage.StorageFile])
    $pdfDocument = Await-DocumentationOperation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($pdfFile)) ([Windows.Data.Pdf.PdfDocument])
    if ($pdfDocument.PageCount -lt 10) { throw ('Unexpected PDF page count: ' + $result.stem) }
    $result | Add-Member -NotePropertyName pdfPageCount -NotePropertyValue $pdfDocument.PageCount
    $previewPages = @(0,1,2,4,10,20,($pdfDocument.PageCount-1)) | Select-Object -Unique
    foreach ($pageNumber in $previewPages) {
        $pdfPage = $pdfDocument.GetPage([uint32]$pageNumber)
        $renderStream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
        try {
            Await-DocumentationAction ($pdfPage.RenderToStreamAsync($renderStream))
            $dataReader = [Windows.Storage.Streams.DataReader]::new($renderStream.GetInputStreamAt(0))
            try { [void](Await-DocumentationOperation ($dataReader.LoadAsync([uint32]$renderStream.Size)) ([uint32])); $imageBytes = [byte[]]::new([int]$renderStream.Size); $dataReader.ReadBytes($imageBytes); [System.IO.File]::WriteAllBytes((Join-Path $previewRoot ($result.stem+'-page-'+($pageNumber+1)+'.png')), $imageBytes) } finally { $dataReader.Dispose() }
        } finally { $renderStream.Dispose(); $pdfPage.Dispose() }
    }
    $result | Add-Member -NotePropertyName pdfPreviewPages -NotePropertyValue @($previewPages | ForEach-Object { $_ + 1 })
}
$validation = [ordered]@{preparedDate='2026-10-12';trackedSourceFilesCompared=@($baseline.PSObject.Properties).Count;applicationSourceUnchanged=$true;verifiedCapturePngs=$manifest.screenshots.Count;browserBusinessWrites=0;uncaughtBrowserErrors=0;wordVisualRenderingAvailable=$false;pdfRenderer='Windows.Data.Pdf';documents=$results}
$validation | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $documentationRoot 'validation-report.json') -Encoding UTF8
$results | Format-Table stem,embeddedPngs,pdfPageCount,xmlPartsValidated -AutoSize
Write-Output ('PASS: source files unchanged; '+$manifest.screenshots.Count+' screenshot hashes verified; DOCX XML/relationships and actual PDF pages validated.')
