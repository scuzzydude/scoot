import { Link, useLocation } from "wouter";
import { useAuth } from "../../hooks/use-auth.js";
import { Button } from "../ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import { Avatar, AvatarFallback } from "../ui/avatar.js";
import { LogOut } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/chat": "Chat",
  "/wallet": "Wallet",
  "/bot": "Bot",
  "/auth": "Sign in",
};

export function Header() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const title =
    Object.entries(pageTitles).find(([path]) => location.startsWith(path))?.[1] ?? "Scoot";

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 bg-black border-b border-border flex items-center px-4 gap-3">
      <Link href="/" className="shrink-0">
        <img
          src="/assets/white_on_transparent_scoot.png"
          alt="Scoot"
          className="h-7 w-auto"
          style={{ maxWidth: 48 }}
        />
      </Link>

      <span className="flex-1 text-center text-sm font-semibold">{title}</span>

      <div className="shrink-0 w-8 flex justify-end">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full p-0">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-white/10">
                    {user.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <div className="px-2 py-1.5 text-sm font-medium">{user.username}</div>
              <div className="px-2 pb-1.5 text-xs text-white/50">{user.email}</div>
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
