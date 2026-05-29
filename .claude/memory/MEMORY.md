# Memory Index

- [Mask secrets in saved transcripts (public repo)](feedback_transcript_redaction.md) — `scripts/save-session.cjs` redacts API keys / hex / DB creds in both JSONL+MD; extend patterns, never disable
- [Scoot conceptual model — Foundation, Scoot(X), scootage, pledges](scoot_concept_model.md) — Design vocabulary from Brandon's book; Scoot(34) = The Dream Laboratory / Fonde Brotherhood; per-Scoot UI term overloading
- [Revised build plan — chat → staking → token → chain](project_plan.md) — Chat polish first; staking ritual is core identity primitive; token after; scootchain last
- [Staking ritual — QR + code + selfie pledge](social_graph_staking.md) — In-person ceremony A→B: QR scan, one-time code, second scan, selfie saved as pledge proof. Chains form trust graph
- [Chat bots — multi-bot, @mention triggered](chat_bots_design.md) — Bots are users w/ is_bot=true, personality in `bots` table, `@name` triggers, provider abstraction (Anthropic v1), typing indicators on
- [Keep SETUP.md current with install procedure](feedback_setup_procedure.md) — update SETUP.md in the same commit whenever env vars or first-run steps change
- [WSL2 remote access — mirrored networking + SSH](infra_wsl_network.md) — LAN IP 192.168.1.118; SSH :22 passwordless from work laptop; Vite :5173, RC :3100 reachable on LAN
- [Prod server — steve (Azure VM)](infra_prod_server.md) — 13.64.77.78, hosts fairchildlabs.org + thedreamlaboratory.org; Scoot stack on Docker, API :3000, Vite :5174, DATA_DIR=/var/lib/scoot
- [Claude Code runs ON prod steve, not WSL](infra_claude_runs_on_steve.md) — when in /home/brandon/scoot, the host IS prod; no SSH-to-deploy; edits go straight to prod
- [Twilio US SMS needs A2P 10DLC registration](twilio_a2p_10dlc_registration.md) — Fonde Brotherhood account, +13614232253 long-code; undelivered + errorCode 30034 means reg gap, not a code bug
- [Git remote: use SSH not HTTPS](infra_git_remote_ssh.md) — `git@github.com:scuzzydude/scoot.git`; SSH keys uploaded on all 3 machines; switch remote without asking if it's HTTPS
- [Prod DB migrations — never db:push](infra_prod_db_migrations.md) — db:push wants to DROP the connect-pg-simple session table; use ALTER TABLE in the postgres container. Prod DB on host :5433; app bind-mounts repo + tsx watch (code live, no rebuild)
