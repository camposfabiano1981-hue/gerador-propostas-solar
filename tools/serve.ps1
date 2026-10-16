<#
  Servidor HTTP local mínimo para testar a plataforma sem instalar nada.

  Uso:
    powershell -ExecutionPolicy Bypass -File tools\serve.ps1            # http://localhost:8765/
    powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 9000

  Opcional (apenas desenvolvimento): -SaveDir <pasta> habilita POST /__save?name=arquivo.docx,
  que grava o corpo da requisição na pasta indicada (usado para testes automatizados).
#>
param(
  [int]$Port = 8765,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$SaveDir = ""
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path.TrimEnd('\') + '\'

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'; '.svg' = 'image/svg+xml'
  '.png'  = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.ico' = 'image/x-icon'
  '.pdf'  = 'application/pdf'
  '.docx' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Servindo $Root em http://localhost:$Port/  (Ctrl+C para parar)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

      if ($req.HttpMethod -eq 'POST' -and $path -eq '/__save' -and $SaveDir) {
        $name = [IO.Path]::GetFileName([string]$req.QueryString['name'])
        if (-not $name) { $name = 'arquivo.bin' }
        New-Item -ItemType Directory -Force $SaveDir | Out-Null
        $target = Join-Path $SaveDir $name
        $fs = [IO.File]::Create($target)
        try { $req.InputStream.CopyTo($fs) } finally { $fs.Close() }
        $msg = [Text.Encoding]::UTF8.GetBytes("salvo: $target")
        $res.StatusCode = 200
        $res.OutputStream.Write($msg, 0, $msg.Length)
        continue
      }

      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart('/')))
      if (-not $file.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $res.StatusCode = 404
        $msg = [Text.Encoding]::UTF8.GetBytes('404 - nao encontrado')
        $res.OutputStream.Write($msg, 0, $msg.Length)
        continue
      }

      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $bytes = [IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      try { $res.StatusCode = 500 } catch {}
      Write-Warning $_
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
