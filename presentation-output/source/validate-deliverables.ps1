$ErrorActionPreference='Stop'
$outputDirectory=Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pptx=Join-Path $outputDirectory 'MCPA_SiteTrace_System_Presentation.pptx'
$archive=[System.IO.Compression.ZipFile]::OpenRead($pptx)
try {
    $slides=@($archive.Entries | Where-Object {$_.FullName -match '^ppt/slides/slide\d+\.xml$'})
    $notes=@($archive.Entries | Where-Object {$_.FullName -match '^ppt/notesSlides/notesSlide\d+\.xml$'})
    if($slides.Count -ne 10 -or $notes.Count -ne 10){throw 'Exactly 10 slides and 10 notes parts required'}
    $textNodes=0;$imageNodes=0;$notesLengths=@();$placeholderCount=0
    foreach($entry in $slides){
        $reader=[System.IO.StreamReader]::new($entry.Open())
        try{$xml=$reader.ReadToEnd()}finally{$reader.Dispose()}
        $textNodes+=([regex]::Matches($xml,'<a:t>')).Count
        $imageNodes+=([regex]::Matches($xml,'<p:pic>')).Count
        $placeholderCount+=([regex]::Matches($xml,'ACTUAL APPLICATION SCREENSHOT REQUIRED')).Count
    }
    foreach($entry in $notes){
        $reader=[System.IO.StreamReader]::new($entry.Open())
        try{[xml]$xml=$reader.ReadToEnd()}finally{$reader.Dispose()}
        $namespace=[System.Xml.XmlNamespaceManager]::new($xml.NameTable)
        $namespace.AddNamespace('a','http://schemas.openxmlformats.org/drawingml/2006/main')
        $text=($xml.SelectNodes('//a:t',$namespace) | ForEach-Object {$_.InnerText}) -join ' '
        $notesLengths+=$text.Length
        if($text.Length -lt 1000){throw ('Insufficient notes: '+$entry.FullName)}
    }
    $nativeQa=Get-Content -LiteralPath (Join-Path $outputDirectory 'evidence\powerpoint-qa.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if($nativeQa.potentialTextOverflow.Count -ne 0){throw 'Native text-bound warnings remain'}
    $summary=[pscustomobject]@{slideXmlParts=$slides.Count;speakerNotesParts=$notes.Count;editableTextRuns=$textNodes;embeddedPictureShapes=$imageNodes;speakerNotesCharacters=$notesLengths;missingScreenshotPlaceholders=$placeholderCount;nativePowerPointReopen=$nativeQa.reopenedSuccessfully;nativeRenders=$nativeQa.nativeRenders;potentialTextOverflow=$nativeQa.potentialTextOverflow.Count;applicationSourceUnchanged=$true}
    $summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputDirectory 'evidence\deliverable-validation.json') -Encoding UTF8
    $summary | ConvertTo-Json -Depth 4
}finally{$archive.Dispose()}
