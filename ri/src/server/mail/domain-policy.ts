// Which addresses count as "dreamlab" for the mail-account-linking gate
// (see permissions.ts) — a small, closed, org-specific allowlist, not worth
// an env var or DB table.
const DREAMLAB_DOMAINS = ["thedreamlaboratory.org", "fairchildlabs.org"];
const DREAMLAB_ADDRESSES = ["fonde.brotherhood@gmail.com"];

export function isDreamlabAddress(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (DREAMLAB_ADDRESSES.includes(normalized)) return true;
  const domain = normalized.split("@")[1];
  return !!domain && DREAMLAB_DOMAINS.includes(domain);
}
