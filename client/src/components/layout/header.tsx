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
import { MessageSquare, Wallet, Bot, LogOut, User } from "lucide-react";

const navLinks = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/bot", label: "Bot", icon: Bot },
];

export function Header() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 border-b border-border bg-black flex items-center px-4 gap-4">
      <Link href="/" className="flex items-center shrink-0">
        <img src="/assets/white_on_transparent_scoot.png" alt="Scoot" className="h-7" />
      </Link>

      {user && (
        <nav className="flex items-center gap-1 ml-2">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant="ghost"
                size="sm"
                className={location.startsWith(href) ? "text-white" : "text-white/60 hover:text-white"}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            </Link>
          ))}
        </nav>
      )}

      <div className="ml-auto">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1.5 text-sm font-medium">{user.username}</div>
              <div className="px-2 pb-1 text-xs text-white/50">{user.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link href="/auth">
            <Button size="sm" variant="outline">Sign in</Button>
          </Link>
        )}
      </div>
    </header>
  );
}
