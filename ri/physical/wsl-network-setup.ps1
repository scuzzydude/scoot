# WSL2 Network Setup — Run once as Administrator in PowerShell on Windows
# Opens firewall ports so other machines on the subnet can reach Scoot + SSH into WSL.
#
# Right-click PowerShell → "Run as Administrator", then paste this whole file.
# Or: powershell -ExecutionPolicy Bypass -File wsl-network-setup.ps1

$ports = @(
    @{ Port = 2222;  Name = "WSL SSH";              Protocol = "TCP" },
    @{ Port = 3000;  Name = "Scoot API";             Protocol = "TCP" },
    @{ Port = 3100;  Name = "Rocket.Chat";           Protocol = "TCP" },
    @{ Port = 5173;  Name = "Scoot Frontend (Vite)"; Protocol = "TCP" },
    @{ Port = 5432;  Name = "Postgres";              Protocol = "TCP" }
)

foreach ($p in $ports) {
    $ruleName = "Scoot - $($p.Name) ($($p.Port))"
    # Remove existing rule if present
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    # Add inbound allow rule
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol $p.Protocol `
        -LocalPort $p.Port `
        -Action Allow `
        -Profile Any | Out-Null
    Write-Host "OK  $ruleName"
}

Write-Host ""
Write-Host "Done. Restart WSL for mirrored networking to take effect:"
Write-Host "  wsl --shutdown"
Write-Host "  (then reopen your WSL terminal)"
Write-Host ""
Write-Host "After restart, services will be on your Windows IP:"
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -like "*Wi-Fi*" -or $_.InterfaceAlias -like "*Ethernet*" `
    -and $_.IPAddress -notlike "169.*"
} | Select-Object -First 1).IPAddress
Write-Host "  SSH:     ssh scuzzydude@$ip -p 2222"
Write-Host "  Scoot:   http://$($ip):5173"
Write-Host "  RC:      http://$($ip):3100"
