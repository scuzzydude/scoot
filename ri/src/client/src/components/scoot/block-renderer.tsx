import ReactMarkdown from "react-markdown";
import type { PageBlock } from "../../api/scoots.js";

// Registry maps component names to React components.
// Add new embedded components here — the server only stores the name.
const COMPONENT_REGISTRY: Record<string, () => JSX.Element> = {};

function MarkdownBlock({ content }: { content: Record<string, unknown> }) {
  const text = typeof content.text === "string" ? content.text : "";
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

function ImageBlock({ content }: { content: Record<string, unknown> }) {
  const url = typeof content.url === "string" ? content.url : "";
  const alt = typeof content.alt === "string" ? content.alt : "";
  const caption = typeof content.caption === "string" ? content.caption : undefined;
  return (
    <figure className="my-4">
      <img src={url} alt={alt} className="w-full rounded-lg object-cover" />
      {caption && <figcaption className="mt-1 text-center text-xs text-white/50">{caption}</figcaption>}
    </figure>
  );
}

function LinkListBlock({ content }: { content: Record<string, unknown> }) {
  const links = Array.isArray(content.links) ? content.links as { label: string; href: string; external?: boolean }[] : [];
  return (
    <ul className="space-y-2 my-4">
      {links.map((link, i) => (
        <li key={i}>
          <a
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noopener noreferrer" : undefined}
            className="text-white underline underline-offset-2 hover:text-white/70 transition-colors"
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function ComponentBlock({ content }: { content: Record<string, unknown> }) {
  const name = typeof content.component === "string" ? content.component : "";
  const Comp = COMPONENT_REGISTRY[name];
  if (Comp) return <Comp />;
  return (
    <div className="border border-white/10 rounded-lg px-4 py-3 text-white/40 text-sm italic">
      [{name}]
    </div>
  );
}

export function BlockRenderer({ block }: { block: PageBlock }) {
  switch (block.blockType) {
    case "markdown":
      return <MarkdownBlock content={block.content} />;
    case "image":
      return <ImageBlock content={block.content} />;
    case "link_list":
      return <LinkListBlock content={block.content} />;
    case "component":
      return <ComponentBlock content={block.content} />;
    default:
      return null;
  }
}
