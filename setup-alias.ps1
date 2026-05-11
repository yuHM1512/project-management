# Script để tạo alias cho PowerShell
# Chạy lệnh này một lần: . .\setup-alias.ps1
# Sau đó có thể dùng: uvicorn-dev

function Start-UvicornDev {
    uvicorn main:app --port 8004 --reload
}

Set-Alias -Name uvicorn-dev -Value Start-UvicornDev

Write-Host "Alias 'uvicorn-dev' đã được tạo!" -ForegroundColor Green
Write-Host "Bây giờ bạn có thể chạy: uvicorn-dev" -ForegroundColor Yellow
Write-Host "Hoặc vẫn dùng: uvicorn main:app --reload --port 8004" -ForegroundColor Yellow


