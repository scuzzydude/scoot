import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { scootsApi } from "../api/scoots.js";
import { useScoot } from "../hooks/use-scoot.js";
import { BlockRenderer } from "../components/scoot/block-renderer.js";

export default function ScootPage() {
  const { slug } = useParams<{ slug: string }>();
  const { activeScoot } = useScoot();

  const { data: page, isLoading, isError } = useQuery({
    queryKey: ["scoot-page", activeScoot?.id, slug],
    queryFn: () => scootsApi.getPage(activeScoot!.id, slug!),
    enabled: !!activeScoot && !!slug,
  });

  if (!activeScoot) {
    return (
      <div className="flex items-center justify-center h-40 text-white/40 text-sm">
        No active community.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-white/40 text-sm">
        Loading…
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="flex items-center justify-center h-40 text-white/40 text-sm">
        Page not found.
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-full">
      {page.blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
