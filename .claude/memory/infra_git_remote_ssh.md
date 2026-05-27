---
name: infra-git-remote-ssh
description: Use SSH (not HTTPS) for the scoot git remote — SSH keys already uploaded to GitHub on all 3 machines
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0d78b688-fdc7-4a65-ba35-6d34172c862c
---

Always use SSH for the `origin` remote on this repo: `git@github.com:scuzzydude/scoot.git`.

**Why:** HTTPS push fails with `could not read Username for 'https://github.com'` because no credential helper is configured. Brandon has already uploaded SSH keys to GitHub from all 3 machines (laptop, home, work — see [[infra-wsl-network]]), so SSH works out of the box. Switching to SSH is the expected fix, not setting up `gh auth login`.

**How to apply:** If a fresh clone or machine shows `origin` as `https://github.com/scuzzydude/scoot`, switch it immediately without asking:

```bash
git remote set-url origin git@github.com:scuzzydude/scoot.git
```

Then retry the push. Don't offer HTTPS auth setup as an option.
