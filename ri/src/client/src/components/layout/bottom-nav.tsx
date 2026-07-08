import { Link, useLocation } from "wouter";
import { MessageSquare, Wallet, Bot, FileText, Inbox, Eye } from "lucide-react";
import { useScoot } from "../../hooks/use-scoot.js";
import { hasLeader } from "../../api/scoots.js";

const FIXED_NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/bot", label: "Bot", icon: Bot },
  { href: "/sms-log", label: "Texts", icon: Inbox },
];

export function BottomNav() {
  const [location] = useLocation();
  const { activeScoot } = useScoot();

  const dynamicItems = (activeScoot?.navItems ?? [])
    .filter((item) => !item.external)
    .map((item) => ({ href: item.href, label: item.label, icon: FileText }));

  // Oversight tab only for a per-Scoot LEADER (server also gates the endpoint).
  const leaderItems = hasLeader(activeScoot?.userFlags)
    ? [{ href: "/oversight", label: "Oversight", icon: Eye }]
    : [];

  const allItems = [...FIXED_NAV, ...dynamicItems, ...leaderItems];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 h-16 w-full max-w-[640px] bg-black border-t border-border flex">
      {allItems.map(({ href, label, icon: Icon }) => {
        const active = location.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              active ? "text-white" : "text-white/35 hover:text-white/70"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium tracking-wide">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
