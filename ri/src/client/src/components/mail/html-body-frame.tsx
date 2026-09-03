import { useRef, useState } from "react";

const MAX_HEIGHT = 2400; // safety cap -- a pathological email (huge tracking pixel, etc.) shouldn't blow up the page

// Sandboxed HTML email body that grows to fit its content instead of
// scrolling inside a fixed-height box. `allow-same-origin` on a srcDoc
// iframe (no allow-scripts) keeps the iframe's effective origin the same as
// the host page, so contentDocument is readable here to measure height.
export function HtmlBodyFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(260);

  // Add base target="_blank" so all links open in new tabs. Emails without a
  // <head> (or with an uppercase one) still get the base tag, prepended.
  const BASE_TAG = '<base target="_blank">';
  const htmlWithBaseTarget = /<base\b/i.test(html)
    ? html
    : /<head\b[^>]*>/i.test(html)
      ? html.replace(/<head\b[^>]*>/i, (m) => m + BASE_TAG)
      : BASE_TAG + html;

  return (
    <iframe
      ref={ref}
      title="message body"
      // allow-popups-to-escape-sandbox: without it the new tab inherits this
      // frame's no-scripts sandbox, so JS-based tracking redirects (Brevo,
      // Mailchimp, etc.) render a blank "Redirection" page.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
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
