import { useAuth } from "../hooks/use-auth.js";

// Set VITE_RC_URL in your environment for production. Defaults to dev port.
const RC_URL = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_RC_URL ?? "http://localhost:3100";

export default function ChatPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 text-sm text-white/60 shrink-0">
        <span>Brotherhood Chat</span>
        <a
          href={RC_URL}
          target="_blank"
          rel="noreferrer"
          className="text-white/40 hover:text-white/70 transition-colors text-xs"
        >
          Open in new tab ↗
        </a>
      </div>

      <iframe
        src={`${RC_URL}/channel/general`}
        title="Brotherhood Chat"
        className="flex-1 w-full border-0 bg-black"
        allow="camera; microphone; fullscreen"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
      />

      {/* Shown until Scoot→RC SSO is wired */}
      <div className="px-4 py-2 border-t border-white/10 text-xs text-white/40 shrink-0 text-center">
        First time? Log in with your Rocket.Chat credentials.{" "}
        <span className="hidden">{user?.username}</span>
      </div>
    </div>
  );
}
