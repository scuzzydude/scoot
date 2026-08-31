import { Plus } from "lucide-react";
import type { MailAccountSummary, MailFolder } from "../../api/mail.js";

export function MailSidebar({
  accounts,
  accountId,
  onSelectAccount,
  folders,
  folder,
  onSelectFolder,
  onLinkClick,
}: {
  accounts: MailAccountSummary[];
  accountId: number | null;
  onSelectAccount: (id: number) => void;
  folders: MailFolder[];
  folder: string;
  onSelectFolder: (path: string) => void;
  onLinkClick: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-1">
        <h4 className="text-[11px] uppercase tracking-wide text-white/40 font-semibold px-1">Accounts</h4>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5">
        {accounts.map((a) => {
          const open = a.id === accountId;
          return (
            <div key={a.id} className="mb-0.5">
              <button
                onClick={() => onSelectAccount(a.id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-white/5"
              >
                <span className="h-1.5 w-1.5 rounded-sm bg-white shrink-0" />
                <span className="text-sm font-medium flex-1 truncate">{a.label}</span>
                {a.needsReauth && <span className="text-[10px] text-white/50">⚠</span>}
                {!a.isDreamlab && <span className="text-[9px] border border-white/15 text-white/40 rounded px-1">personal</span>}
              </button>
              {open && (
                <div className="pl-6 pb-1">
                  {folders.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => onSelectFolder(f.path)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs ${
                        f.path === folder ? "bg-white/10 text-white font-medium" : "text-white/60 hover:bg-white/5"
                      }`}
                    >
                      <span className="flex-1 truncate">{f.name}</span>
                      {f.unread > 0 && <span className="text-white/40 tabular-nums">{f.unread}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="p-2 border-t border-white/10">
        <button
          onClick={onLinkClick}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border border-white/15 text-white/70 hover:bg-white/5"
        >
          <Plus className="h-3.5 w-3.5" /> Link account
        </button>
      </div>
    </div>
  );
}
