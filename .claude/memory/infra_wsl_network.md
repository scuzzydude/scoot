---
name: WSL2 remote access — mirrored networking + SSH
description: LAN access to WSL2 dev environment — ports, SSH key, firewall setup
type: project
originSessionId: 3e8bd300-b67c-4525-9471-d1c991f4e918
---
WSL2 is configured with mirrored networking (`~/.wslconfig` on Windows). WSL IP on LAN: **192.168.1.118**.

**SSH:** Port 22, user `scuzzydude`. Brandon's work laptop key (`mchp-main\c33416@HOU-LT-C33416`) is in `~/.ssh/authorized_keys` — passwordless login works from that machine via PuTTY.

**Windows Firewall rules added (PowerShell as Admin):**
- Port 22 (SSH) — added manually after reboot
- Ports 2222, 3000, 5173, 5432 — added by `ri/physical/wsl-network-setup.ps1`

**Services reachable from LAN:**
- Frontend (Vite): `http://192.168.1.118:5173`
- Scoot API: `http://192.168.1.118:3000`
- SSH: `ssh scuzzydude@192.168.1.118`

**Why:** Brandon works across 3 machines; WSL needs to be reachable from other machines on the home LAN without a VPN.

**How to apply:** If networking breaks after a reboot, check `ss -tlnp` for SSH on :22 and re-run the PS1 script as Admin if firewall rules were lost.
