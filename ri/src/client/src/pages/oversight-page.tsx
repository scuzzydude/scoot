import { useQuery } from "@tanstack/react-query";
import { useScoot } from "../hooks/use-scoot.js";
import { scootsApi, hasLeader, type OversightMessage } from "../api/scoots.js";
import { PrivacyNotice } from "../components/privacy-notice.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Eye, Lock } from "lucide-react";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function Row({ m }: { m: OversightMessage }) {
  return (
    <div className="border-b border-white/5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-white">{m.author}</span>
        <span className="shrink-0 text-[10px] text-white/40">{fmtTime(m.createdAt)}</span>
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">
        {m.roomName ?? `room ${m.roomId}`}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{m.content}</p>
    </div>
  );
}

export default function OversightPage() {
  const { activeScoot } = useScoot();
  const isLeader = hasLeader(activeScoot?.userFlags);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["oversight", activeScoot?.id],
    queryFn: () => scootsApi.oversightMessages(activeScoot!.id, { limit: 200 }),
    enabled: !!activeScoot && isLeader,
  });

  if (activeScoot && !isLeader) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-20 text-center text-white/50">
        <Lock className="h-6 w-6" />
        <p className="text-sm">Leaders only.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col px-4">
      <div className="flex items-center gap-2 py-3">
        <Eye className="h-4 w-4 text-white/70" />
        <h1 className="text-base font-semibold">Oversight — all messages</h1>
      </div>
      <div className="pb-2"><PrivacyNotice /></div>
      <ScrollArea className="flex-1">
        {isLoading && <p className="py-8 text-center text-sm text-white/50">Loading…</p>}
        {isError && (
          <p className="py-8 text-center text-sm text-red-400">
            {error instanceof Error ? error.message : "Couldn't load messages."}
          </p>
        )}
        {!isLoading && !isError && (data?.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-white/50">No messages yet.</p>
        )}
        <div className="pb-4">
          {(data ?? []).map((m) => <Row key={m.id} m={m} />)}
        </div>
      </ScrollArea>
    </div>
  );
}
