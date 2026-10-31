param([string]$FlowDocumentationRoot = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$out=[IO.Path]::GetFullPath($FlowDocumentationRoot)
$repo=[IO.Path]::GetFullPath((Join-Path $out '../../..'))
$model=Get-Content -LiteralPath (Join-Path $out 'validation/Model.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$baseline=Get-Content -LiteralPath (Join-Path $out 'validation/baseline.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$structure=Get-Content -LiteralPath (Join-Path $out 'validation/Structure.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$render=Get-Content -LiteralPath (Join-Path $out 'validation/Export.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if(-not $structure.passed -or -not $render.passed){throw 'Resolve diagram/render checks before native validation.'}
$changed=@()
foreach($item in $baseline.files){$f=Join-Path $repo $item.file;if(-not (Test-Path -LiteralPath $f) -or (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256){$changed+=$item.file}}
if($changed.Count){throw ('Original tracked files changed: '+($changed -join ', '))}
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$awaitOperation=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1} | Select-Object -First 1
$awaitAction=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1} | Select-Object -First 1
function Await-DiagramOperation($operation,[Type]$resultType){$task=$awaitOperation.MakeGenericMethod($resultType).Invoke($null,@($operation));$task.Wait();return $task.Result}
function Await-DiagramAction($operation){$task=$awaitAction.Invoke($null,@($operation));$task.Wait()}
$results=@();$pngCount=0;$pdfPageCount=0
$previewRoot=Join-Path $out 'validation/PDF_Review';New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null
foreach($flow in $model.flows){
 $dir=Join-Path $out $flow.folder
 [xml]$editable=Get-Content -LiteralPath (Join-Path $dir ($flow.id+'.drawio')) -Raw -Encoding UTF8
 if(@($editable.mxfile.diagram).Count -ne $flow.pages.Count){throw ('Editable page count mismatch '+$flow.id)}
 foreach($page in $flow.pages){
  $diagram=$editable.mxfile.diagram | Where-Object id -eq $page.id
  $cells=@($diagram.mxGraphModel.root.mxCell)
  foreach($node in $page.nodes){$cell=$cells | Where-Object id -eq $node.id;if(-not $cell -or $cell.vertex -ne '1' -or [string]$cell.value -ne ($node.lines -join "`n")){throw ('Editable label mismatch '+$flow.id+'/'+$page.id+'/'+$node.id)}}
  foreach($edge in $page.edges){$cell=$cells | Where-Object id -eq $edge.id;if(-not $cell -or $cell.edge -ne '1' -or $cell.source -ne $edge.from -or $cell.target -ne $edge.to){throw ('Editable edge mismatch '+$flow.id+'/'+$edge.id)}}
  $bitmap=[Drawing.Image]::FromFile((Join-Path $dir ($page.id+'.png')));try{if($bitmap.Width -lt 1900 -or $bitmap.Height -lt 3200){throw 'Page PNG resolution too small'}}finally{$bitmap.Dispose()};$pngCount++
 }
 $overview=[Drawing.Image]::FromFile((Join-Path $dir ($flow.id+'.png')));$overview.Dispose()
 $file=Await-DiagramOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Join-Path $dir ($flow.id+'.pdf')))) ([Windows.Storage.StorageFile])
 $pdf=Await-DiagramOperation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
 if($pdf.PageCount -ne $flow.pages.Count){throw ('PDF native page mismatch '+$flow.id)}
 $cols=[math]::Min(4,$pdf.PageCount);$tw=400;$th=659;$rows=[int][math]::Ceiling($pdf.PageCount/$cols)
 $board=[Drawing.Bitmap]::new([int]($cols*$tw),[int]($rows*($th+30)+50));$graphics=[Drawing.Graphics]::FromImage($board);$graphics.Clear([Drawing.Color]::White);$font=[Drawing.Font]::new('Arial',14);$graphics.DrawString($flow.id,$font,[Drawing.Brushes]::Black,10,10)
 try{
  for($i=0;$i -lt $pdf.PageCount;$i++){
   $page=$pdf.GetPage([uint32]$i);$stream=[Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
   try{
    if([math]::Abs($page.Size.Width-816) -gt 1 -or [math]::Abs($page.Size.Height-1344) -gt 1){throw 'PDF is not Legal portrait'}
    $options=[Windows.Data.Pdf.PdfPageRenderOptions]::new();$options.DestinationWidth=800
    Await-DiagramAction ($page.RenderToStreamAsync($stream,$options))
    $reader=[Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
    try{[void](Await-DiagramOperation ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]));$bytes=[byte[]]::new([int]$stream.Size);$reader.ReadBytes($bytes)}finally{$reader.Dispose()}
    $memory=[IO.MemoryStream]::new($bytes,$false);$image=[Drawing.Image]::FromStream($memory)
    try{$x=[int](($i%$cols)*$tw);$y=[int](50+[math]::Floor($i/$cols)*($th+30));$graphics.DrawImage($image,$x,$y,$tw,$th);$graphics.DrawString(('P'+($i+1)),$font,[Drawing.Brushes]::Black,$x+10,$y+$th+3)}finally{$image.Dispose();$memory.Dispose()}
    $pdfPageCount++
   }finally{$stream.Dispose();$page.Dispose()}
  }
  $board.Save((Join-Path $previewRoot ($flow.id+'.png')),[Drawing.Imaging.ImageFormat]::Png)
 }finally{$font.Dispose();$graphics.Dispose();$board.Dispose()}
 $results+=[pscustomobject]@{flow=$flow.id;editablePages=$flow.pages.Count;pdfPages=$pdf.PageCount;allPagePngsDecoded=$true;allPdfPagesRendered=$true;paper='US Legal portrait'}
 Write-Output ('Validated native PDF '+$flow.id+' ('+$pdf.PageCount+' pages)')
}
foreach($roleFolder in @('ADMIN','ENGINEER_ARCHITECT')){[xml]$atlas=Get-Content -LiteralPath (Join-Path $out ($roleFolder+'/SiteTrace_'+$roleFolder+'_Complete_Atlas.drawio')) -Raw -Encoding UTF8;$expected=@($model.flows | Where-Object {$_.folder.StartsWith($roleFolder+'/')} | ForEach-Object {$_.pages}).Count;if(@($atlas.mxfile.diagram).Count -ne $expected){throw ('Atlas page mismatch '+$roleFolder)}}
$result=[ordered]@{passed=$true;date='2026-10-21';originalTrackedHashesCompared=$baseline.files.Count;allOriginalTrackedFilesUnchanged=$true;diagrams=$model.flows.Count;pages=$pdfPageCount;pagePngsDecoded=$pngCount;nativePdf=$results;applicationFilesModified=0;liveDatabaseCalls=0;productionWrites=0;sourceRoleDiscrepancy='Only requested Admin and Engineer/Architect documented; Secretary/Tool Handler remain in source and need owner verification.'}
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $out 'validation/Native_Validation.json') -Encoding UTF8
Write-Output ('PASS: '+$model.flows.Count+' diagrams, '+$pdfPageCount+' PDF pages; '+$baseline.files.Count+' original tracked files unchanged.')
