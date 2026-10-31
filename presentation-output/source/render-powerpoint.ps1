param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$sourceDirectory = $PSScriptRoot
$outputDirectory = Split-Path -Parent $sourceDirectory
$deckPath = Join-Path $outputDirectory 'MCPA_SiteTrace_System_Presentation.pptx'
$layout = Get-Content -LiteralPath (Join-Path $sourceDirectory 'deck.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function Convert-Color([string]$hex) {
    return [int]([Convert]::ToInt32($hex.Substring(0,2),16) + 256*[Convert]::ToInt32($hex.Substring(2,2),16) + 65536*[Convert]::ToInt32($hex.Substring(4,2),16))
}
function Set-Fill($shape, $color, $stroke) {
    if ($color) { $shape.Fill.Visible = -1; $shape.Fill.Solid(); $shape.Fill.ForeColor.RGB = Convert-Color $color }
    else { $shape.Fill.Visible = 0 }
    if ($stroke) { $shape.Line.Visible = -1; $shape.Line.ForeColor.RGB = Convert-Color $stroke; $shape.Line.Weight = 0.7 }
    else { $shape.Line.Visible = 0 }
}
$application = $null
$presentation = $null
$checks = [System.Collections.Generic.List[object]]::new()
$overflow = [System.Collections.Generic.List[object]]::new()
try {
    $application = New-Object -ComObject PowerPoint.Application
    $application.DisplayAlerts = 1
    if (-not $VerifyOnly) {
        $presentation = $application.Presentations.Add(0)
        $presentation.PageSetup.SlideWidth = $layout.width
        $presentation.PageSetup.SlideHeight = $layout.height
        foreach ($slideLayout in $layout.slides) {
            $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, 12)
            $slide.FollowMasterBackground = 0
            $slide.Background.Fill.Solid()
            $slide.Background.Fill.ForeColor.RGB = Convert-Color $slideLayout.bg
            foreach ($item in $slideLayout.shapes) {
                $shape = $null
                switch ($item.type) {
                    'rect' { $shape=$slide.Shapes.AddShape(1,$item.x,$item.y,$item.w,$item.h); Set-Fill $shape $item.fill $item.stroke }
                    'roundrect' { $shape=$slide.Shapes.AddShape(5,$item.x,$item.y,$item.w,$item.h); Set-Fill $shape $item.fill $item.stroke }
                    'line' {
                        $shape=$slide.Shapes.AddLine($item.x,$item.y,$item.x2,$item.y2)
                        $shape.Line.ForeColor.RGB=Convert-Color $item.color
                        $shape.Line.Weight=[single]$item.width
                        if($item.arrow){$shape.Line.EndArrowheadStyle=3}
                    }
                    'image' {
                        Add-Type -AssemblyName System.Drawing
                        $image=[System.Drawing.Image]::FromFile($item.file)
                        $scale=[Math]::Min($item.w/$image.Width,$item.h/$image.Height)
                        $width=$image.Width*$scale
                        $height=$image.Height*$scale
                        $image.Dispose()
                        $shape=$slide.Shapes.AddPicture($item.file,0,-1,($item.x+($item.w-$width)/2),($item.y+($item.h-$height)/2),$width,$height)
                        $shape.AlternativeText = 'Actual SiteTrace application. Local isolated test environment, synthetic data. Source: '+[System.IO.Path]::GetFileName($item.file)
                    }
                    'text' {
                        $shape=$slide.Shapes.AddTextbox(1,$item.x,$item.y,$item.w,$item.h)
                        $shape.Line.Visible=0
                        $shape.Fill.Visible=0
                        $shape.TextFrame.MarginLeft=0
                        $shape.TextFrame.MarginRight=0
                        $shape.TextFrame.MarginTop=0
                        $shape.TextFrame.MarginBottom=0
                        $shape.TextFrame.WordWrap=-1
                        $shape.TextFrame.AutoSize=0
                        $shape.TextFrame2.VerticalAnchor=1
                        $shape.TextFrame.TextRange.Text=$item.text.Replace("`n","`r")
                        $range=$shape.TextFrame.TextRange
                        $range.Font.Name=$layout.font
                        $range.Font.Size=[single]$item.size
                        $range.Font.Bold=if($item.bold){-1}else{0}
                        $range.Font.Color.RGB=Convert-Color $item.color
                        $range.ParagraphFormat.SpaceBefore=0
                        $range.ParagraphFormat.SpaceAfter=0
                        $range.ParagraphFormat.LineRuleWithin=-1
                        $range.ParagraphFormat.SpaceWithin=[single]1.05
                        $range.ParagraphFormat.Alignment=if($item.align -eq 'right'){3}elseif($item.align -eq 'center'){2}else{1}
                        if($item.tracking){$shape.TextFrame2.TextRange.Font.Spacing=[single]$item.tracking}
                        if($item.name){$shape.Name=$item.name}
                        $shape.TextFrame2.AutoSize=0
                        $shape.TextFrame2.WordWrap=-1
                        $shape.Width=[single]$item.w
                        $shape.Height=[single]$item.h
                        $shape.Left=[single]$item.x
                        $shape.Top=[single]$item.y
                    }
                }
            }
            $noteBody=$null
            foreach($placeholder in $slide.NotesPage.Shapes.Placeholders){if($placeholder.PlaceholderFormat.Type -eq 2){$noteBody=$placeholder;break}}
            if($null -eq $noteBody){throw 'Speaker-notes body placeholder missing'}
            $noteBody.TextFrame.TextRange.Text=$slideLayout.notes.Replace("`n","`r")
            Write-Output ('Built slide '+$slide.SlideIndex+': '+$slideLayout.title)
        }
        $presentation.SaveAs($deckPath,24)
        $presentation.Close()
        $presentation=$null
    }
    $presentation=$application.Presentations.Open($deckPath,-1,0,0)
    if($presentation.Slides.Count -ne 10){throw 'Slide count must be exactly 10'}
    if([Math]::Abs($presentation.PageSetup.SlideWidth/$presentation.PageSetup.SlideHeight-16/9) -gt 0.001){throw 'Presentation must be 16:9'}
    foreach($slide in $presentation.Slides){
        $textCount=0;$imageCount=0;$nativeShapeCount=0;$noteLength=0
        foreach($shape in $slide.Shapes){
            if($shape.Type -eq 13){$imageCount++}else{$nativeShapeCount++}
            if($shape.HasTextFrame -and $shape.TextFrame.HasText){
                $textCount++
                $bound=$shape.TextFrame2.TextRange
                if($bound.BoundHeight -gt $shape.Height+1.5 -or $bound.BoundWidth -gt $shape.Width+1.5){
                    $overflow.Add([pscustomobject]@{slide=$slide.SlideIndex;shape=$shape.Name;text=$shape.TextFrame.TextRange.Text;boxWidth=$shape.Width;boxHeight=$shape.Height;boundWidth=$bound.BoundWidth;boundHeight=$bound.BoundHeight})
                }
            }
        }
        foreach($placeholder in $slide.NotesPage.Shapes.Placeholders){if($placeholder.PlaceholderFormat.Type -eq 2){$noteLength=$placeholder.TextFrame.TextRange.Text.Length}}
        if($noteLength -lt 100){throw ('Missing substantial speaker notes on slide '+$slide.SlideIndex)}
        $checks.Add([pscustomobject]@{slide=$slide.SlideIndex;editableTextBoxes=$textCount;editableShapes=$nativeShapeCount;images=$imageCount;speakerNoteCharacters=$noteLength;title=$layout.slides[$slide.SlideIndex-1].title})
        $renderPath=Join-Path $outputDirectory ('renders\slide-'+$slide.SlideIndex.ToString('00')+'.png')
        $slide.Export($renderPath,'PNG',1920,1080)
        Write-Output ('Rendered slide '+$slide.SlideIndex)
    }
    $presentation.SaveAs((Join-Path $outputDirectory 'MCPA_SiteTrace_System_Presentation.pdf'),32)
    [pscustomobject]@{date='2026-10-24';application='Microsoft PowerPoint';version=$application.Version;reopenedSuccessfully=$true;slideCount=$presentation.Slides.Count;widthPoints=$presentation.PageSetup.SlideWidth;heightPoints=$presentation.PageSetup.SlideHeight;slides=$checks;potentialTextOverflow=$overflow;nativeRenders=10;pdfCreated=$true} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputDirectory 'evidence\powerpoint-qa.json') -Encoding UTF8
    Write-Output ('PPTX saved and reopened: '+$deckPath)
    Write-Output ('Text-bound warnings: '+$overflow.Count)
} finally {
    if($presentation){$presentation.Close()}
    if($application){[System.Runtime.InteropServices.Marshal]::ReleaseComObject($application) | Out-Null}
}
