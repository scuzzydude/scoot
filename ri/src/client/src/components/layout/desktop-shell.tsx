import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../hooks/use-auth.js";
import { useScoot } from "../../hooks/use-scoot.js";
import { useLayoutMode } from "../../hooks/use-layout-mode.js";
import { useNavItems } from "../../hooks/use-nav-items.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import { Avatar, AvatarFallback } from "../ui/avatar.js";
import { Button } from "../ui/button.js";
import { LogOut, Smartphone } from "lucide-react";

// A page that wants a custom sidebar/right panel (chat, mail) registers it
// here instead of DesktopShell owning per-route knowledge of every page.
// Everything else falls back to the default nav sidebar and no right panel
// -- "every other page renders unchanged inside main" from the plan.
interface DesktopSlotsContextValue {
  setSidebar: (node: ReactNode | null) => void;
  setRightPanel: (node: ReactNode | null) => void;
}
const DesktopSlotsContext = createContext<DesktopSlotsContextValue>({
  setSidebar: () => {},
  setRightPanel: () => {},
});

export function useDesktopSlots(opts: { sidebar?: ReactNode; rightPanel?: ReactNode }) {
  const { setSidebar, setRightPanel } = useContext(DesktopSlotsContext);
  const { mode } = useLayoutMode();
  useEffect(() => {
    if (mode !== "desktop") return;
    setSidebar(opts.sidebar ?? null);
    setRightPanel(opts.rightPanel ?? null);
    return () => {
      setSidebar(null);
      setRightPanel(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, opts.sidebar, opts.rightPanel]);
}

function DefaultNavSidebar() {
  const [location] = useLocation();
  const items = useNavItems();
  return (
    <nav className="flex flex-col py-2">
      {items.map(({ href, label, icon: Icon }) => {
        const active = location.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              active ? "bg-white/10 text-white font-medium" : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { activeScoot, allScoots, setActiveScoot } = useScoot();
  const { setMode } = useLayoutMode();
  const [sidebarOverride, setSidebar] = useState<ReactNode | null>(null);
  const [rightPanel, setRightPanel] = useState<ReactNode | null>(null);

  return (
    <DesktopSlotsContext.Provider value={{ setSidebar, setRightPanel }}>
      <div className="min-h-screen flex flex-col">
        <header className="h-14 shrink-0 flex items-center gap-4 px-4 border-b border-white/10">
          <Link href="/" className="shrink-0 flex items-center">
            <img src="/assets/white_on_transparent_scoot.png" alt="Scoot" className="h-7 w-auto" style={{ maxWidth: 38 }} />
          </Link>

          {user && allScoots.length > 1 && activeScoot && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="px-2 h-7 text-white/70 hover:text-white">
                  {activeScoot.name}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {allScoots.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => setActiveScoot(s.id)} className={s.id === activeScoot.id ? "font-medium" : ""}>
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex-1" />

          {user && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/50 hover:text-white"
              title="Switch to mobile view"
              onClick={() => setMode("mobile")}
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          )}

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full p-0">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-white/10">
                      {(user.displayName ?? user.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <div className="px-2 py-1.5 text-sm font-medium">{user.displayName ?? user.username}</div>
                <div className="px-2 pb-1.5 text-xs text-white/50">@{user.username} · {user.email}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <div className="flex-1 min-h-0 flex">
          {user && (
            <aside className="w-60 shrink-0 border-r border-white/10 overflow-y-auto">
              {sidebarOverride ?? <DefaultNavSidebar />}
            </aside>
          )}

          <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

          {rightPanel && (
            <aside className="w-80 shrink-0 border-l border-white/10 overflow-y-auto">{rightPanel}</aside>
          )}
        </div>
      </div>
    </DesktopSlotsContext.Provider>
  );
}
