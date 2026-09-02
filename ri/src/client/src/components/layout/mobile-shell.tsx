import type { ReactNode } from "react";
import { Header } from "./header.js";
import { BottomNav } from "./bottom-nav.js";
import { useAuth } from "../../hooks/use-auth.js";
import { ImpersonationBanner } from "./impersonation.js";

// Pure extraction of the pre-desktop-mode App.tsx body -- the default
// experience stays byte-for-byte unchanged.
export function MobileShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // The fixed header is 3.5rem; the view-as banner (also fixed) adds 1.75rem.
  const topPad = user?.impersonating ? "pt-[5.25rem]" : "pt-14";

  return (
    <div className="mx-auto w-full max-w-[640px] min-h-screen md:border-x md:border-white/5 relative">
      <Header />
      <ImpersonationBanner fixedBelowHeader />
      <main className={`${topPad} ${user ? "pb-16" : ""}`}>{children}</main>
      {user && <BottomNav />}
    </div>
  );
}
