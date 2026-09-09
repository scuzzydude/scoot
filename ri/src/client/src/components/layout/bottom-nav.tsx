import { Link, useLocation } from "wouter";
import { useNavItems } from "../../hooks/use-nav-items.js";

export function BottomNav() {
  const [location] = useLocation();
  const allItems = useNavItems();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 h-16 w-full max-w-[640px] bg-black border-t border-border flex">
      {allItems.map(({ href, label, icon: Icon, external }) => {
        const active = !external && location.startsWith(href);
        const className = `flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
          active ? "text-white" : "text-white/35 hover:text-white/70"
        }`;
        const body = (
          <>
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium tracking-wide">{label}</span>
          </>
        );
        return external ? (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={className}>{body}</a>
        ) : (
          <Link key={href} href={href} className={className}>{body}</Link>
        );
      })}
    </nav>
  );
}
