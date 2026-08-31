import { Link, useLocation } from "wouter";
import { useNavItems } from "../../hooks/use-nav-items.js";

export function BottomNav() {
  const [location] = useLocation();
  const allItems = useNavItems();

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
