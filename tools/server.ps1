# Kleiner lokaler Webserver fuer die Trainings-Kamera (nur auf diesem PC erreichbar)
param([int]$Port = 8765)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.css'='text/css';
  '.wasm'='application/wasm'; '.tflite'='application/octet-stream'; '.json'='application/json';
  '.png'='image/png'; '.webmanifest'='application/manifest+json'; '.mp4'='video/mp4'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Port $Port ist belegt - laeuft die Trainings-Kamera schon?" -ForegroundColor Yellow
  Start-Process "http://localhost:$Port/"; exit
}
Write-Host "Trainings-Kamera laeuft auf http://localhost:$Port/  (Fenster offen lassen, zum Beenden schliessen)" -ForegroundColor Green
$browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
             "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
             "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
             "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) { Start-Process $browser "--app=http://localhost:$Port/ --start-maximized" } else { Start-Process "http://localhost:$Port/" }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($path -eq '') { $path = 'index.html' }
  $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
  $res = $ctx.Response
  if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $res.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
    $res.Headers.Add('Cache-Control', 'no-cache')
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $res.ContentLength64 = $bytes.Length
    try { $res.OutputStream.Write($bytes, 0, $bytes.Length) } catch {}
  } else { $res.StatusCode = 404 }
  $res.Close()
}
