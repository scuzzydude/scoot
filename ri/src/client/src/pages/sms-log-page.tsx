import { useQuery } from "@tanstack/react-query";
import { smsApi, type SmsLogItem } from "../api/sms.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { PrivacyNotice } from "../components/privacy-notice.js";
import { MessageSquare } from "lucide-react";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// One text as a chat bubble. direction "in" = the member texted it (right, dark);
// "out" = it arrived on their phone from BigMo / a room (left, muted).
function Bubble({ item }: { item: SmsLogItem }) {
  const mine = item.direction === "in";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          mine ? "bg-primary text-primary-foreground" : "bg-muted text-white"
        }`}
      >
        {item.body}
      </div>
      <div className="mt-0.5 px-1 text-[10px] text-white/40">
        {item.roomName ? `[${item.roomName}] · ` : ""}{fmtTime(item.createdAt)}
      </div>
    </div>
  );
}

export default function SmsLogPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sms-log"],
    queryFn: () => smsApi.log({ limit: 200 }),
  });

  // API returns newest-first; show oldest→newest like a normal transcript.
  const items = data ? [...data].reverse() : [];

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col px-4">
      <div className="flex items-center gap-2 py-3">
        <MessageSquare className="h-4 w-4 text-white/70" />
        <h1 className="text-base font-semibold">Your text log</h1>
      </div>
      <p className="pb-2 text-xs text-white/50">
        Every text that went to or from your phone — BigMo replies, group messages, and notices.
      </p>
      <div className="pb-2"><PrivacyNotice /></div>
      <ScrollArea className="flex-1">
        {isLoading && <p className="py-8 text-center text-sm text-white/50">Loading…</p>}
        {isError && (
          <p className="py-8 text-center text-sm text-red-400">
            {error instanceof Error ? error.message : "Couldn't load your text log."}
          </p>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <p className="py-8 text-center text-sm text-white/50">No texts yet.</p>
        )}
        <div className="flex flex-col gap-3 pb-4">
          {items.map((item) => <Bubble key={item.id} item={item} />)}
        </div>
      </ScrollArea>
    </div>
  );
}
