#!/usr/bin/env python3
"""Quick read benchmark: local OS disk vs Azure Blob (rclone remote, Cool tier).

Usage:  sudo python3 scripts/storage-read-bench.py [--size-mb 128] [--remote azarchive:bench]
(sudo only so the local COLD read can drop the page cache; everything else is unprivileged.)

Measures, for one big file and one tiny file:
  local cold   -- page cache dropped, read from the OS disk
  local warm   -- same file again, served from RAM
  blob         -- streamed through rclone from the storage account (2 runs)
  tiny latency -- per-read latency of a 1 KB file, local vs blob
Nothing is deleted from the remote; the test blobs live under <remote>/ and can
be removed with:  rclone purge <remote>
"""
import argparse, os, subprocess, sys, time, shutil, statistics

ap = argparse.ArgumentParser()
ap.add_argument("--size-mb", type=int, default=128)
ap.add_argument("--remote", default="azarchive:bench")
ap.add_argument("--local-dir", default="/var/tmp/storage-bench")
ap.add_argument("--tiny-runs", type=int, default=5)
args = ap.parse_args()

BIG = "big.bin"; TINY = "tiny.bin"
os.makedirs(args.local_dir, exist_ok=True)
big_path = os.path.join(args.local_dir, BIG); tiny_path = os.path.join(args.local_dir, TINY)

# Under sudo, rclone would look for root's config; point it at the invoking user's.
_sudo_user = os.environ.get("SUDO_USER")
if _sudo_user and "RCLONE_CONFIG" not in os.environ:
    import pwd
    os.environ["RCLONE_CONFIG"] = os.path.join(pwd.getpwnam(_sudo_user).pw_dir, ".config/rclone/rclone.conf")

def sh(cmd, **kw):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.exit(f"command failed: {cmd}\n{r.stderr.strip()}")
    return r

def timed(cmd):
    t = time.perf_counter(); sh(cmd); return time.perf_counter() - t

def mbps(nbytes, secs): return nbytes / secs / 1e6

# --- fixtures (created once, reused on later runs)
if not os.path.exists(big_path) or os.path.getsize(big_path) != args.size_mb * 1024 * 1024:
    print(f"creating {args.size_mb} MB random file ...", flush=True)
    sh(f"head -c {args.size_mb * 1024 * 1024} /dev/urandom > {big_path}")
if not os.path.exists(tiny_path):
    sh(f"head -c 1024 /dev/urandom > {tiny_path}")
big_bytes = os.path.getsize(big_path)

listed = sh(f"rclone lsf {args.remote} 2>/dev/null || true").stdout.split()
for name, path in ((BIG, big_path), (TINY, tiny_path)):
    if name not in listed:
        print(f"uploading {name} to {args.remote} ...", flush=True)
        t = timed(f"rclone copyto {path} {args.remote}/{name}")
        if name == BIG: print(f"  upload: {mbps(big_bytes, t):.1f} MB/s ({t:.1f}s)")

can_drop = os.geteuid() == 0
def drop_caches():
    if can_drop:
        sh("sync; echo 3 > /proc/sys/vm/drop_caches")

results = []
# --- big file
drop_caches()
t = timed(f"dd if={big_path} of=/dev/null bs=1M 2>/dev/null")
results.append(("local disk, cold (cache dropped)" if can_drop else "local disk (cache NOT dropped, no sudo)", f"{mbps(big_bytes, t):7.1f} MB/s", f"{t:.2f}s"))
t = timed(f"dd if={big_path} of=/dev/null bs=1M 2>/dev/null")
results.append(("local disk, warm (page cache)", f"{mbps(big_bytes, t):7.1f} MB/s", f"{t:.2f}s"))
for i in (1, 2):
    t = timed(f"rclone cat {args.remote}/{BIG} | dd of=/dev/null bs=1M 2>/dev/null")
    results.append((f"blob via rclone, run {i}", f"{mbps(big_bytes, t):7.1f} MB/s", f"{t:.2f}s"))

# --- tiny file latency
drop_caches()
lat_local = []
for _ in range(args.tiny_runs):
    drop_caches(); lat_local.append(timed(f"cat {tiny_path} > /dev/null"))
lat_blob = [timed(f"rclone cat {args.remote}/{TINY} > /dev/null") for _ in range(args.tiny_runs)]
lat_list = [timed(f"rclone lsf {args.remote} > /dev/null") for _ in range(3)]
results.append(("1 KB read, local (median)", f"{statistics.median(lat_local)*1000:7.2f} ms", f"n={args.tiny_runs}"))
results.append(("1 KB read, blob (median)", f"{statistics.median(lat_blob)*1000:7.2f} ms", f"n={args.tiny_runs}"))
results.append(("directory listing, blob (median)", f"{statistics.median(lat_list)*1000:7.2f} ms", "n=3"))

w = max(len(r[0]) for r in results)
print(f"\nfile size: {big_bytes/1e6:.0f} MB   remote: {args.remote}   local: {args.local_dir}\n")
for name, val, extra in results:
    print(f"  {name.ljust(w)}  {val}   {extra}")
print("\nblob reads bill per GB on the Cool tier; the test blobs stay in place for re-runs (rclone purge to remove).")
