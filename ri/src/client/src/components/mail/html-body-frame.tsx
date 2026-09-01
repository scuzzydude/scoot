import { useRef, useState } from "react";

const MAX_HEIGHT = 2400; // safety cap -- a pathological email (huge tracking pixel, etc.) shouldn't blow up the page

// Sandboxed HTML email body that grows to fit its content instead of
// scrolling inside a fixed-height box. `allow-same-origin` on a srcDoc
// iframe (no allow-scripts) keeps the iframe's effective origin the same as
// the host page, so contentDocument is readable here to measure height.
export function HtmlBodyFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(260);

  // Add base target="_blank" so all links open in new tabs
  const htmlWithBaseTarget = html.includes("<base")
    ? html
    : html.replace("<head>", "<head><base target=\"_blank\">");

  return (
    <iframe
      ref={ref}
      title="message body"
      sandbox="allow-same-origin allow-popups"
      srcDoc={htmlWithBaseTarget}
      className="w-full rounded-lg border border-white/10 bg-white"
      style={{ height }}
      onLoad={() => {
        const doc = ref.current?.contentDocument;
        if (!doc) return;
        const contentHeight = doc.documentElement.scrollHeight;
        setHeight(Math.min(contentHeight + 16, MAX_HEIGHT));
      }}
    />
  );
}
