import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../hooks/use-auth.js";
import { authApi } from "../../api/auth.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import { Button } from "../ui/button.js";
import { Avatar, AvatarFallback } from "../ui/avatar.js";

// Persistent strip shown whenever Root is viewing the app as someone else.
// Inverted (white on black theme) on purpose: it must be impossible to forget
// whose account is on screen. `fixedBelowHeader` is for the mobile shell,
// whose header is position:fixed; desktop just flows it in.
export function ImpersonationBanner({ fixedBelowHeader = false }: { fixedBelowHeader?: boolean }) {
  const { user, stopImpersonation } = useAuth();
  if (!user?.impersonating) return null;
  const viewing = user.displayName ?? user.username;
  const actor = user.impersonating.actorDisplayName ?? user.impersonating.actorUsername;
  const pos = fixedBelowHeader
    ? "fixed top-14 left-1/2 -translate-x-1/2 z-40 w-full max-w-[640px]"
    : "w-full";
  return (
    <div className={`${pos} h-7 bg-white text-black text-xs flex items-center justify-center gap-3 px-3`}>
      <span className="truncate">
        Viewing as <span className="font-semibold">{viewing}</span> · read-only
      </span>
      <button type="button" onClick={() => stopImpersonation()} className="underline font-medium shrink-0">
        Back to {actor}
      </button>
    </div>
  );
}

// Picker dialog. Owned by whichever header opened it (state lives there,
// because a Dialog rendered inside a DropdownMenuItem unmounts with the menu).
export function ImpersonateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, impersonate, impersonateError } = useAuth();
  const { data: targets, isLoading } = useQuery({
    queryKey: ["auth", "impersonate", "targets"],
    queryFn: authApi.impersonationTargets,
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>View as</DialogTitle>
          <DialogDescription>
            See the app exactly as another member does. Read-only: nothing can be sent or changed while viewing.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto -mx-2">
          {isLoading && <div className="px-2 py-3 text-sm text-white/50">Loading…</div>}
          {targets?.map((t) => {
            const name = t.displayName ?? t.username;
            const current = user?.impersonating && user.id === t.id;
            return (
              <Button
                key={t.id}
                variant="ghost"
                disabled={!!current}
                onClick={() => impersonate(t.id)}
                className="w-full justify-start gap-3 h-11 px-2"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-[10px] bg-white/10">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="flex flex-col items-start min-w-0">
                  <span className="text-sm truncate">{name}</span>
                  <span className="text-xs text-white/50 truncate">@{t.username}{current ? " · viewing now" : ""}</span>
                </span>
              </Button>
            );
          })}
          {targets && targets.length === 0 && <div className="px-2 py-3 text-sm text-white/50">No other members yet.</div>}
        </div>
        {impersonateError && <p className="text-xs text-white/70">{impersonateError.message}</p>}
      </DialogContent>
    </Dialog>
  );
}
