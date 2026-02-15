param(
  [string]$OutputPath = "docs/public/og.png"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [Math]::Max(1, $Radius * 2)
  $arc = New-Object System.Drawing.RectangleF -ArgumentList @($X, $Y, $diameter, $diameter)

  $path.AddArc($arc, 180, 90)
  $arc.X = $X + $Width - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Y + $Height - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundRect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = New-RoundRectPath -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

function Draw-RoundRect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Pen]$Pen,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = New-RoundRectPath -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
  $Graphics.DrawPath($Pen, $path)
  $path.Dispose()
}

function Add-Glow {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$CenterX,
    [float]$CenterY,
    [float]$RadiusX,
    [float]$RadiusY,
    [System.Drawing.Color]$Color
  )
  # Type guard for safety with strict mode and PowerShell array coercion.
  $cx = if ($CenterX -is [System.Array]) { [single]$CenterX[0] } else { [single]$CenterX }
  $cy = if ($CenterY -is [System.Array]) { [single]$CenterY[0] } else { [single]$CenterY }
  $rx = if ($RadiusX -is [System.Array]) { [single]$RadiusX[0] } else { [single]$RadiusX }
  $ry = if ($RadiusY -is [System.Array]) { [single]$RadiusY[0] } else { [single]$RadiusY }
  $rect = New-Object System.Drawing.RectangleF -ArgumentList @(
    ($cx - $rx),
    ($cy - $ry),
    ($rx * 2),
    ($ry * 2)
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($rect)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterColor = $Color
  $brush.SurroundColors = ,([System.Drawing.Color]::FromArgb(0, $Color.R, $Color.G, $Color.B))
  $Graphics.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

$width = 1200
$height = 630

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$bgRect = New-Object System.Drawing.RectangleF -ArgumentList @(0, 0, $width, $height)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $bgRect,
  [System.Drawing.Color]::FromArgb(255, 11, 13, 18),
  [System.Drawing.Color]::FromArgb(255, 17, 22, 34),
  90
)
$graphics.FillRectangle($bgBrush, $bgRect)
$bgBrush.Dispose()

# Subtle grid lines
$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18, 255, 255, 255), 1)
for ($x = 40; $x -lt $width; $x += 80) {
  $graphics.DrawLine($gridPen, $x, 0, $x, $height)
}
for ($y = 40; $y -lt $height; $y += 80) {
  $graphics.DrawLine($gridPen, 0, $y, $width, $y)
}
$gridPen.Dispose()

# Glows
Add-Glow -Graphics $graphics -CenterX 200 -CenterY 120 -RadiusX 260 -RadiusY 200 -Color ([System.Drawing.Color]::FromArgb(120, 59, 130, 246))
Add-Glow -Graphics $graphics -CenterX 980 -CenterY 520 -RadiusX 320 -RadiusY 240 -Color ([System.Drawing.Color]::FromArgb(90, 34, 211, 238))

# Title text
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 59, 130, 246))
$titleFont = New-Object System.Drawing.Font("Bahnschrift", 64, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString("Papyrus", $titleFont, $titleBrush, (New-Object System.Drawing.PointF -ArgumentList @(70, 90)))
$titleBrush.Dispose()
$titleFont.Dispose()

$headlineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 236, 240, 248))
$headlineFont = New-Object System.Drawing.Font("Bahnschrift", 44, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$headlineRect = New-Object System.Drawing.RectangleF -ArgumentList @(70, 170, 560, 160)
$headlineFormat = New-Object System.Drawing.StringFormat
$headlineFormat.Trimming = [System.Drawing.StringTrimming]::Word
$headlineFormat.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
$graphics.DrawString("Open source`nPDF/EPUB/TXT SDK", $headlineFont, $headlineBrush, $headlineRect, $headlineFormat)
$headlineBrush.Dispose()
$headlineFont.Dispose()
$headlineFormat.Dispose()

$bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 190, 198, 212))
$bodyFont = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bodyRect = New-Object System.Drawing.RectangleF -ArgumentList @(70, 330, 560, 120)
$bodyFormat = New-Object System.Drawing.StringFormat
$bodyFormat.Trimming = [System.Drawing.StringTrimming]::Word
$bodyFormat.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
$graphics.DrawString("Build document readers with search, annotations, and theming for web and mobile.", $bodyFont, $bodyBrush, $bodyRect, $bodyFormat)
$bodyBrush.Dispose()
$bodyFont.Dispose()
$bodyFormat.Dispose()

# Mockup card with shadow
$mockX = 620
$mockY = 110
$mockW = 500
$mockH = 410

$shadowPath = New-RoundRectPath -X ($mockX + 8) -Y ($mockY + 12) -Width $mockW -Height $mockH -Radius 28
$shadowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($shadowPath)
$shadowBrush.CenterColor = [System.Drawing.Color]::FromArgb(130, 0, 0, 0)
$shadowBrush.SurroundColors = ,([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$graphics.FillPath($shadowBrush, $shadowPath)
$shadowBrush.Dispose()
$shadowPath.Dispose()

$cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 20, 27))
$cardBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 42, 50, 62), 1)
Fill-RoundRect -Graphics $graphics -Brush $cardBrush -X $mockX -Y $mockY -Width $mockW -Height $mockH -Radius 26
Draw-RoundRect -Graphics $graphics -Pen $cardBorder -X $mockX -Y $mockY -Width $mockW -Height $mockH -Radius 26
$cardBrush.Dispose()
$cardBorder.Dispose()

$screenX = $mockX + 18
$screenY = $mockY + 18
$screenW = $mockW - 36
$screenH = $mockH - 36

$screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 12, 14, 18))
Fill-RoundRect -Graphics $graphics -Brush $screenBrush -X $screenX -Y $screenY -Width $screenW -Height $screenH -Radius 20
$screenBrush.Dispose()

# Top bar
$topBarBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 24, 30, 39))
Fill-RoundRect -Graphics $graphics -Brush $topBarBrush -X $screenX -Y $screenY -Width $screenW -Height 44 -Radius 18
$topBarBrush.Dispose()

# Top bar controls
$controlBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 82, 91, 104))
$graphics.FillEllipse($controlBrush, $screenX + 16, $screenY + 12, 10, 10)
$graphics.FillEllipse($controlBrush, $screenX + 34, $screenY + 12, 10, 10)
$graphics.FillEllipse($controlBrush, $screenX + 52, $screenY + 12, 10, 10)
$controlBrush.Dispose()

# Document page
$pageX = $screenX + 20
$pageY = $screenY + 70
$pageW = $screenW - 40
$pageH = $screenH - 110
$pageShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
Fill-RoundRect -Graphics $graphics -Brush $pageShadow -X ($pageX + 4) -Y ($pageY + 6) -Width $pageW -Height $pageH -Radius 10
$pageShadow.Dispose()

$pageBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 242, 236))
Fill-RoundRect -Graphics $graphics -Brush $pageBrush -X $pageX -Y $pageY -Width $pageW -Height $pageH -Radius 10
$pageBrush.Dispose()

$textLineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 196, 190, 180))
for ($i = 0; $i -lt 10; $i++) {
  $lineY = $pageY + 20 + ($i * 18)
  $lineW = $pageW - 40
  if ($i % 3 -eq 0) { $lineW = $pageW - 120 }
  $graphics.FillRectangle($textLineBrush, $pageX + 20, $lineY, $lineW, 8)
}
$textLineBrush.Dispose()

# Annotation card
$noteX = $pageX + 40
$noteY = $pageY + 120
$noteW = 260
$noteH = 120

$noteShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
Fill-RoundRect -Graphics $graphics -Brush $noteShadow -X ($noteX + 6) -Y ($noteY + 8) -Width $noteW -Height $noteH -Radius 14
$noteShadow.Dispose()

$noteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 24, 27, 34))
Fill-RoundRect -Graphics $graphics -Brush $noteBrush -X $noteX -Y $noteY -Width $noteW -Height $noteH -Radius 14
$noteBrush.Dispose()

$noteBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 50, 58, 70), 1)
Draw-RoundRect -Graphics $graphics -Pen $noteBorder -X $noteX -Y $noteY -Width $noteW -Height $noteH -Radius 14
$noteBorder.Dispose()

$noteTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 180, 186, 198))
$noteTitleFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString("NOTA", $noteTitleFont, $noteTitleBrush, (New-Object System.Drawing.PointF -ArgumentList @(
  ($noteX + 16),
  ($noteY + 12)
)))
$noteTitleBrush.Dispose()
$noteTitleFont.Dispose()

$noteBodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 234, 242))
$noteBodyFont = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$noteBodyRect = New-Object System.Drawing.RectangleF -ArgumentList @(
  ($noteX + 16),
  ($noteY + 34),
  ($noteW - 32),
  ($noteH - 50)
)
$noteBodyFormat = New-Object System.Drawing.StringFormat
$noteBodyFormat.Trimming = [System.Drawing.StringTrimming]::Word
$noteBodyFormat.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit
$graphics.DrawString("Esta nota foi carregada via configuracao inicial.", $noteBodyFont, $noteBodyBrush, $noteBodyRect, $noteBodyFormat)
$noteBodyBrush.Dispose()
$noteBodyFont.Dispose()
$noteBodyFormat.Dispose()

$closeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 68, 68))
$graphics.FillEllipse($closeBrush, $noteX + $noteW - 28, $noteY - 12, 20, 20)
$closeBrush.Dispose()

# Bottom toolbar
$toolbarY = $screenY + $screenH - 44
$toolbarBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 24, 31))
Fill-RoundRect -Graphics $graphics -Brush $toolbarBrush -X ($screenX + 40) -Y $toolbarY -Width ($screenW - 80) -Height 32 -Radius 16
$toolbarBrush.Dispose()

$iconBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 94, 104, 118))
for ($i = 0; $i -lt 6; $i++) {
  $ix = $screenX + 70 + ($i * 48)
  $graphics.FillEllipse($iconBrush, $ix, $toolbarY + 10, 8, 8)
}
$iconBrush.Dispose()

$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
