import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useScoot } from "../hooks/use-scoot.js";
import { scootsApi, type CatalogEdge } from "../api/scoots.js";
import { chatApi } from "../api/chat.js";
import { PrivacyNotice } from "../components/privacy-notice.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Button } from "../components/ui/button.js";
import { Users, Crown, Star, Camera } from "lucide-react";

function TierBadge({ tier }: { tier: "member" | "senior" | "og" }) {
  if (tier === "member") return null;
  return (
    <span className="ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-white/10 text-white/70">
      {tier === "og" ? "OG" : "Senior"}
    </span>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt={name} className="h-10 w-10 shrink-0 rounded-full object-cover border border-white/10" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs text-white/40">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

// Recursive hierarchy row: this person, then their own stakees indented below.
function CatalogNode({
  userId, name, selfieUrl, tier, edgesByStaker, depth,
}: {
  userId: number; name: string; selfieUrl: string | null; tier: "member" | "senior" | "og";
  edgesByStaker: Map<number, CatalogEdge[]>; depth: number;
}) {
  const children = edgesByStaker.get(userId) ?? [];
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1.5">
        <Avatar url={selfieUrl} name={name} />
        <div className="flex items-center text-sm text-white">
          {name}
          <TierBadge tier={tier} />
        </div>
      </div>
      {children.map((e) => (
        <CatalogNode
          key={e.pledgeId}
          userId={e.stakeeId}
          name={e.stakeeName}
          selfieUrl={e.selfieUrl}
          tier={e.tier}
          edgesByStaker={edgesByStaker}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function SelfStakeAction({ scootId }: { scootId: number }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const url = await chatApi.uploadMedia(file);
      await scootsApi.selfStake(scootId, url);
    },
    onMutate: () => { setBusy(true); setError(null); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staking-catalog", scootId] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Self-stake failed"),
    onSettled: () => setBusy(false),
  });

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="mb-2 text-xs text-white/70">
        You're the root of trust and hold the engineer bootstrap flag — you can self-stake to seed the chain.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) mutation.mutate(f); }}
      />
      <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Camera className="mr-1.5 h-3.5 w-3.5" />
        {busy ? "Self-staking…" : "Self-stake with a photo"}
      </Button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function StakingPage() {
  const { activeScoot } = useScoot();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staking-catalog", activeScoot?.id],
    queryFn: () => scootsApi.stakingCatalog(activeScoot!.id),
    enabled: !!activeScoot,
  });

  const edgesByStaker = new Map<number, CatalogEdge[]>();
  for (const e of data?.edges ?? []) {
    const list = edgesByStaker.get(e.stakerId) ?? [];
    list.push(e);
    edgesByStaker.set(e.stakerId, list);
  }

  const showSelfStake = data?.viewerCanSelfStake && !data.root.selfieUrl;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col px-4">
      <div className="flex items-center gap-2 py-3">
        <Users className="h-4 w-4 text-white/70" />
        <h1 className="text-base font-semibold">Brotherhood — staking catalog</h1>
      </div>
      <div className="pb-2"><PrivacyNotice /></div>
      <ScrollArea className="flex-1">
        {isLoading && <p className="py-8 text-center text-sm text-white/50">Loading…</p>}
        {isError && (
          <p className="py-8 text-center text-sm text-red-400">
            {error instanceof Error ? error.message : "Couldn't load the catalog."}
          </p>
        )}
        {data && (
          <div className="pb-6">
            {showSelfStake && <SelfStakeAction scootId={activeScoot!.id} />}

            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/40">
              <Crown className="h-3 w-3" /> Root of trust
            </div>
            <CatalogNode
              userId={data.root.userId}
              name={data.root.name}
              selfieUrl={data.root.selfieUrl}
              tier="member"
              edgesByStaker={edgesByStaker}
              depth={0}
            />

            {data.legacyMembers.length > 0 && (
              <>
                <div className="mb-1 mt-6 flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/40">
                  <Star className="h-3 w-3" /> Pre-ritual members (no pledge on record)
                </div>
                {data.legacyMembers.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 py-1.5">
                    <Avatar url={null} name={m.name} />
                    <div className="flex items-center text-sm text-white/80">
                      {m.name}
                      <TierBadge tier={m.tier} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
