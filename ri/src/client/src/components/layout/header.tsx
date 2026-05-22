import { Link } from "wouter";
import { useAuth } from "../../hooks/use-auth.js";
import { useScoot } from "../../hooks/use-scoot.js";
import { Button } from "../ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import { Avatar, AvatarFallback } from "../ui/avatar.js";
import { LogOut, ChevronDown } from "lucide-react";

export function Header() {
  const { user, logout } = useAuth();
  const { activeScoot, allScoots, setActiveScoot } = useScoot();

  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 z-50 h-14 w-full max-w-[640px] bg-black border-b border-border flex items-center px-4 gap-3">
      <Link href="/" className="shrink-0 flex items-center">
        <img
          src="/assets/white_on_transparent_scoot.png"
          alt="Scoot"
          className="h-8 w-auto"
          style={{ maxWidth: 44 }}
        />
      </Link>

      {user && activeScoot && (
        <div className="flex-1 min-w-0">
          {allScoots.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="px-2 h-7 text-white/70 hover:text-white max-w-full">
                  <span className="truncate text-sm">{activeScoot.name}</span>
                  <ChevronDown className="ml-1 h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {allScoots.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => setActiveScoot(s.id)}
                    className={s.id === activeScoot.id ? "font-medium" : ""}
                  >
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-sm text-white/70 truncate px-2">{activeScoot.name}</span>
          )}
        </div>
      )}

      {(!user || !activeScoot) && <div className="flex-1" />}

      <div className="shrink-0 w-8 flex justify-end">
        {user ? (
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
        ) : null}
      </div>
    </header>
  );
}
