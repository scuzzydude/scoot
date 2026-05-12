import { Link } from "wouter";
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

export function Header() {
  const { user, logout } = useAuth();

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

      <div className="flex-1" />

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
