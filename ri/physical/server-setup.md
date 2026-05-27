# Server Setup — Data Volume and Docker

How to stand up Scoot on any Linux host with persistent data on a non-boot volume.
Works on Hetzner, DigitalOcean, AWS, Azure, GCP, Vultr, bare metal — anywhere you
can attach a block volume.

## Why this matters

Boot volumes are small and expensive per GB. On most hosts:
- Boot volume: 20–40 GB (OS, Docker daemon, app code)
- Data volume: whatever you need (DB, media, scootchain blocks)

All persistent data lives under `DATA_DIR`, which you point at the data volume.
To move to a bigger host: snapshot the data volume, attach to new host, update DNS. Done.

---

## 1. Attach and format the data volume

On your host provider, create and attach a block volume to the server.
It will appear as a device (e.g. `/dev/sdb` or `/dev/vdb`).

```bash
# Find the device
lsblk

# Format (first time only — destroys existing data)
mkfs.ext4 /dev/sdb

# Create mount point
mkdir -p /mnt/data

# Mount
mount /dev/sdb /mnt/data

# Make it persist across reboots — get the UUID
blkid /dev/sdb
# Add to /etc/fstab:
# UUID=<uuid-here>  /mnt/data  ext4  defaults,nofail  0  2
```

---

## 2. Create the Scoot data directory

```bash
mkdir -p /mnt/data/scoot/postgres
mkdir -p /mnt/data/scoot/media
mkdir -p /mnt/data/scoot/scootchain   # future: scootd blockchain data
```

---

## 3. Move Docker's data root to the data volume (optional but recommended)

By default Docker stores images, containers, and named volumes under `/var/lib/docker`
on the boot volume. Moving it keeps the boot volume clean.

```bash
# Stop Docker
systemctl stop docker

# Edit or create daemon config
cat > /etc/docker/daemon.json <<'EOF'
{
  "data-root": "/mnt/data/docker"
}
EOF

# Move existing data (first time only)
rsync -aP /var/lib/docker/ /mnt/data/docker/

# Start Docker
systemctl start docker

# Verify
docker info | grep "Docker Root Dir"
```

---

## 4. Set DATA_DIR in .env

```bash
# In your .env on the server:
DATA_DIR=/mnt/data/scoot
```

Docker Compose reads this and mounts:
- `$DATA_DIR/postgres` → Postgres data directory
- `$DATA_DIR/media`   → uploaded media files

---

## 5. Start the stack

```bash
npm run docker:up:build
```

No other changes needed. All persistent data lands on the data volume.

---

## Migrating to a new host

```bash
# On old host — snapshot or rsync the data volume
rsync -aP /mnt/data/ newhost:/mnt/data/

# On new host — same setup steps above, then:
npm run docker:up

# Done. No data loss.
```

---

## S3 media storage (recommended for production)

Instead of local filesystem for chat media, point Scoot at S3-compatible storage
(Cloudflare R2, Backblaze B2, AWS S3, MinIO, etc.) via the media env vars.

Benefits:
- Media survives server migration with zero rsync
- Works on any provider
- One config change to switch providers

When using S3, `$DATA_DIR/media` is unused — only needed for scootchain media and
any Scoot-native file serving.

---

## WSL2 Dev Machine — Remote Access Setup

Makes Scoot reachable from any machine on your subnet, and allows SSH into WSL.
Works on Windows 11 + WSL 2.0+ with mirrored networking mode.

### One-time setup (3 steps)

**Step 1 — Install SSH server in WSL** (run in WSL terminal):
```bash
sudo apt-get install -y openssh-server
sudo bash ~/wsl-ssh-setup.sh
```

**Step 2 — Run the Windows firewall script** (run as Administrator on Windows):
The script `wsl-network-setup.ps1` is in `ri/physical/` and on your OneDrive Desktop.
Right-click it → "Run with PowerShell" (or open elevated PowerShell and run it).

Opens inbound rules for: SSH (2222), Scoot API (3000), Vite (5173), Postgres (5432).

**Step 3 — Restart WSL** (in Windows PowerShell/cmd — NOT in WSL):
```powershell
wsl --shutdown
```
Then reopen your WSL terminal. Docker containers auto-restart (`restart: unless-stopped`).

### After restart — your services

Machine IP: **192.168.1.118** (Wi-Fi — may change if DHCP reassigns; check with `ip addr`)

| Service | URL |
|---|---|
| Scoot app | http://192.168.1.118:5173 |
| Scoot API | http://192.168.1.118:3000 |
| SSH into WSL | `ssh scuzzydude@192.168.1.118 -p 2222` |

### Persistence

- SSH service is enabled via systemd — survives WSL restarts automatically
- Docker containers have `restart: unless-stopped` — recover after WSL restart
- `.wslconfig` is permanent — mirrored mode persists across reboots
- If your IP changes (DHCP), check it with `ip addr show eth0 | grep "inet "`
