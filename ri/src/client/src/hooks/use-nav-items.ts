import { MessageSquare, Wallet, Bot, FileText, Inbox, Mail, Eye, Users, Layers, type LucideIcon } from "lucide-react";
import { useScoot } from "./use-scoot.js";
import { hasLeader, hasStaked, hasPowerUser } from "../api/scoots.js";

export interface NavItemDef {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;  // plain <a> to a static page outside the SPA (opens in a new tab)
}

const FIXED_NAV: NavItemDef[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/bot", label: "Bot", icon: Bot },
  { href: "/sms-log", label: "Texts", icon: Inbox },
];

// Shared between BottomNav (mobile) and DesktopShell's default sidebar so the
// set of visible tabs never drifts between the two layouts.
export function useNavItems(): NavItemDef[] {
  const { activeScoot } = useScoot();

  const dynamicItems = (activeScoot?.navItems ?? [])
    .filter((item) => !item.external)
    .map((item) => ({ href: item.href, label: item.label, icon: FileText }));

  const stakedItems: NavItemDef[] = hasStaked(activeScoot?.userFlags)
    ? [{ href: "/staking", label: "Brotherhood", icon: Users }]
    : [];

  const leaderItems: NavItemDef[] = hasLeader(activeScoot?.userFlags)
    ? [{ href: "/oversight", label: "Oversight", icon: Eye }]
    : [];

  // RIM⁵ SIM pages (static, /var/www/html/rim-sim, see docs/rim-sim/) — for
  // power users only: LEADER, BETA or ENGINEER. External so wouter doesn't route it.
  const powerItems: NavItemDef[] = hasPowerUser(activeScoot?.userFlags)
    ? [{ href: "/rim-sim/rim5/index.html", label: "RIM⁵", icon: Layers, external: true }]
    : [];

  return [...FIXED_NAV, ...dynamicItems, ...stakedItems, ...leaderItems, ...powerItems];
}
