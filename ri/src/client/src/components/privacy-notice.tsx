import { ShieldAlert } from "lucide-react";

// In-app rendering of the mandatory no-privacy disclaimer (arch/sms-rooms.md §7).
// The SMS side enforces the yearly send; this is the always-visible app copy.
export function PrivacyNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-snug text-white/60">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/50" />
      <span>
        Messages here are <span className="text-white/80">not private</span>. Group leaders can read all
        messages for safety and accountability.
      </span>
    </div>
  );
}
