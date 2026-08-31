import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

// A page that wants a custom sidebar/right panel (chat, mail) portals it
// into these DOM nodes instead of DesktopShell owning per-route knowledge of
// every page. Everything else falls back to the default nav sidebar and no
// right panel -- "every other page renders unchanged inside main" from the
// plan. Portal target elements (not raw refs) so a child's render can react
// to them becoming available; `hasSidebar`/`hasRightPanel` are plain
// booleans synced via effect purely to toggle the default-sidebar fallback
// -- NOT used to carry the JSX itself, which is portaled directly during
// render. (An earlier version stored the JSX in ancestor state via an
// effect keyed on the JSX's own identity, which is a new object every
// render -- that re-triggered the effect every render, which re-triggered
// the state update, which re-rendered the child, forever: an infinite
// render loop that crashed the whole app to a blank screen. Don't
// reintroduce that shape.)
interface DesktopSlotsContextValue {
  sidebarEl: HTMLElement | null;
  rightPanelEl: HTMLElement | null;
  setHasSidebar: (v: boolean) => void;
  setHasRightPanel: (v: boolean) => void;
}
const DesktopSlotsContext = createContext<DesktopSlotsContextValue>({
  sidebarEl: null,
  rightPanelEl: null,
  setHasSidebar: () => {},
  setHasRightPanel: () => {},
});

export function useDesktopSlots(opts: { sidebar?: ReactNode; rightPanel?: ReactNode }): ReactNode {
  const { sidebarEl, rightPanelEl, setHasSidebar, setHasRightPanel } = useContext(DesktopSlotsContext);
  const { mode } = useLayoutMode();
  const wantSidebar = mode === "desktop" && opts.sidebar != null;
  const wantRightPanel = mode === "desktop" && opts.rightPanel != null;

  useEffect(() => {
    setHasSidebar(wantSidebar);
    return () => setHasSidebar(false);
  }, [wantSidebar, setHasSidebar]);

  useEffect(() => {
    setHasRightPanel(wantRightPanel);
    return () => setHasRightPanel(false);
  }, [wantRightPanel, setHasRightPanel]);

  return (
    <>
      {wantSidebar && sidebarEl ? createPortal(opts.sidebar, sidebarEl) : null}
      {wantRightPanel && rightPanelEl ? createPortal(opts.rightPanel, rightPanelEl) : null}
    </>
  );
}

// Icon-only nav in the topbar -- always visible regardless of what a page
// docks in the sidebar (RoomList, MailSidebar, ...), so a page that takes
// over the whole sidebar for its own content can never trap the user with
// no way to navigate elsewhere.
function TopNav() {
  const [location] = useLocation();
  const items = useNavItems();
  return (
    <nav className="flex items-center gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = location.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
              active ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
          </Link>
        );
      })}
    </nav>
  );
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
  const [sidebarEl, setSidebarEl] = useState<HTMLElement | null>(null);
  const [rightPanelEl, setRightPanelEl] = useState<HTMLElement | null>(null);
  const [hasSidebar, setHasSidebar] = useState(false);
  const [hasRightPanel, setHasRightPanel] = useState(false);

  return (
    <DesktopSlotsContext.Provider value={{ sidebarEl, rightPanelEl, setHasSidebar, setHasRightPanel }}>
      <div className="min-h-screen flex flex-col">
        <header className="h-14 shrink-0 flex items-center gap-4 px-4 border-b border-white/10">
          <Link href="/" className="shrink-0 flex items-center">
            <img src="/assets/white_on_transparent_scoot.png" alt="Scoot" className="h-7 w-auto" style={{ maxWidth: 38 }} />
          </Link>

          {user && <TopNav />}

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
            // Always mounted (ref stability for the portal target) -- width
            // never changes, only whether the default nav or portaled
            // content is visible inside it.
            <aside ref={setSidebarEl} className="w-60 shrink-0 border-r border-white/10 overflow-y-auto">
              {!hasSidebar && <DefaultNavSidebar />}
            </aside>
          )}

          <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

          {user && (
            // Always mounted too, same reason -- just collapses to zero
            // width instead of unmounting when nothing's docked in it.
            <aside
              ref={setRightPanelEl}
              className={hasRightPanel ? "w-80 shrink-0 border-l border-white/10 overflow-y-auto" : "w-0 overflow-hidden"}
            />
          )}
        </div>
      </div>
    </DesktopSlotsContext.Provider>
  );
}
