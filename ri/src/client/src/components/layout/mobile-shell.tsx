import type { ReactNode } from "react";
import { Header } from "./header.js";
import { BottomNav } from "./bottom-nav.js";
import { useAuth } from "../../hooks/use-auth.js";

// Pure extraction of the pre-desktop-mode App.tsx body -- the default
// experience stays byte-for-byte unchanged.
export function MobileShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="mx-auto w-full max-w-[640px] min-h-screen md:border-x md:border-white/5 relative">
      <Header />
      <main className={`pt-14 ${user ? "pb-16" : ""}`}>{children}</main>
      {user && <BottomNav />}
    </div>
  );
}
