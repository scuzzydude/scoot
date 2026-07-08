import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { smsApi, type SmsLogItem } from "../api/sms.js";
import { scootsApi, hasTextAudit, type AllSmsLogItem } from "../api/scoots.js";
import { useScoot } from "../hooks/use-scoot.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "../components/ui/dropdown-menu.js";
import { PrivacyNotice } from "../components/privacy-notice.js";
import { MessageSquare, ChevronDown, ArrowUpRight, ArrowDownLeft } from "lucide-react";

type View = "mine" | "all";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// My-texts view: chat bubbles. "in" = I sent it (right), "out" = I received it (left).
function Bubble({ item }: { item: SmsLogItem }) {
  const mine = item.direction === "in";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
        mine ? "bg-primary text-primary-foreground" : "bg-muted text-white"
      }`}>
        {item.body}
      </div>
      <div className="mt-0.5 px-1 text-[10px] text-white/40">
        {item.roomName ? `[${item.roomName}] · ` : ""}{fmtTime(item.createdAt)}
      </div>
    </div>
  );
}

// All-texts view: a flat sequential row per delivery, tagged with who + direction.
function AuditRow({ item }: { item: AllSmsLogItem }) {
  const inbound = item.direction === "in";
  return (
    <div className="border-b border-white/5 py-2">
      <div className="flex items-center gap-1.5">
        {inbound
          ? <ArrowUpRight className="h-3 w-3 text-emerald-400/70" />
          : <ArrowDownLeft className="h-3 w-3 text-sky-400/70" />}
        <span className="text-sm font-medium text-white">{item.who}</span>
        <span className="text-[10px] text-white/40">{inbound ? "sent" : "received"}</span>
        <span className="ml-auto shrink-0 text-[10px] text-white/40">{fmtTime(item.createdAt)}</span>
      </div>
      {item.roomName && (
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">{item.roomName}</div>
      )}
      <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{item.body}</p>
    </div>
  );
}

export default function SmsLogPage() {
  const { activeScoot } = useScoot();
  const canAudit = hasTextAudit(activeScoot?.userFlags);
  const [view, setView] = useState<View>("mine");
  const showAll = view === "all" && canAudit;

  const mineQ = useQuery({
    queryKey: ["sms-log", "mine"],
    queryFn: () => smsApi.log({ limit: 200 }),
    enabled: !showAll,
  });
  const allQ = useQuery({
    queryKey: ["sms-log", "all", activeScoot?.id],
    queryFn: () => scootsApi.allTexts(activeScoot!.id, { limit: 500 }),
    enabled: showAll && !!activeScoot,
  });

  const active = showAll ? allQ : mineQ;
  const mineItems = mineQ.data ? [...mineQ.data].reverse() : [];

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col px-4">
      <div className="flex items-center justify-between gap-2 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-white/70" />
          <h1 className="text-base font-semibold">{showAll ? "All texts" : "Your text log"}</h1>
        </div>
        {canAudit && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:bg-white/10">
              {view === "all" ? "All texts" : "My texts"}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setView("mine")}>My texts</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("all")}>All texts (audit)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="pb-2 text-xs text-white/50">
        {showAll
          ? "Every text on the platform, newest first — whose it is and which way it went."
          : "Every text that went to or from your phone — BigMo replies, group messages, and notices."}
      </p>
      <div className="pb-2"><PrivacyNotice /></div>
      <ScrollArea className="flex-1">
        {active.isLoading && <p className="py-8 text-center text-sm text-white/50">Loading…</p>}
        {active.isError && (
          <p className="py-8 text-center text-sm text-red-400">
            {active.error instanceof Error ? active.error.message : "Couldn't load the log."}
          </p>
        )}
        {showAll ? (
          <div className="pb-4">
            {!allQ.isLoading && (allQ.data?.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-white/50">No texts yet.</p>
            )}
            {(allQ.data ?? []).map((item) => <AuditRow key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-4">
            {!mineQ.isLoading && mineItems.length === 0 && (
              <p className="py-8 text-center text-sm text-white/50">No texts yet.</p>
            )}
            {mineItems.map((item) => <Bubble key={item.id} item={item} />)}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
