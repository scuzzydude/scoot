# Server Setup — Data Volume and Docker

How to stand up Scoot (and Rocket.Chat) on any Linux host with persistent data on a
non-boot volume. Works on Hetzner, DigitalOcean, AWS, Azure, GCP, Vultr, bare metal —
anywhere you can attach a block volume.

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
mkdir -p /mnt/data/rocketchat/mongo   # future: Rocket.Chat MongoDB
mkdir -p /mnt/data/rocketchat/uploads # future: Rocket.Chat file uploads
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

Instead of local filesystem for media, configure Rocket.Chat to use S3-compatible
storage (Cloudflare R2, Backblaze B2, AWS S3, etc.).

Benefits:
- Media survives server migration with zero rsync
- Works on any provider
- One config change to switch providers

Configure in Rocket.Chat Admin → File Upload → Storage Type → AmazonS3.
Set endpoint URL for non-AWS providers (R2, B2, Wasabi, MinIO).

When using S3, `$DATA_DIR/media` is unused for RC uploads — only needed for
scootchain media and any Scoot-native file serving.
