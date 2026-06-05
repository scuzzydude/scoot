import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { botApi, type BotHistoryEntry, type BotMode } from "../api/bot.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Avatar, AvatarFallback } from "../components/ui/avatar.js";
import { Send, RotateCcw, Bot } from "lucide-react";

function BubbleRow({ entry }: { entry: BotHistoryEntry }) {
  const isUser = entry.role === "user";
  return (
    <div className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-[10px] bg-white/10"><Bot className="h-3 w-3" /></AvatarFallback>
        </Avatar>
      )}
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-white"
        }`}
      >
        {entry.content}
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: BotMode; onChange: (m: BotMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
      <button
        onClick={() => onChange("full")}
        className={`px-2 py-0.5 rounded transition-colors ${
          mode === "full" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
        }`}
      >
        Full AI
      </button>
      <button
        onClick={() => onChange("cotb")}
        className={`px-2 py-0.5 rounded transition-colors ${
          mode === "cotb" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
        }`}
      >
        COTB
      </button>
    </div>
  );
}

export default function BotPage() {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<BotMode>("full");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["bot", "history", mode],
    queryFn: () => botApi.getHistory(mode),
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => botApi.sendMessage(content, mode),
    onMutate: (content) => {
      qc.setQueryData<BotHistoryEntry[]>(["bot", "history", mode], (prev) =>
        [...(prev ?? []), { role: "user", content }]
      );
    },
    onSuccess: ({ reply }) => {
      qc.setQueryData<BotHistoryEntry[]>(["bot", "history", mode], (prev) =>
        [...(prev ?? []), { role: "assistant", content: reply }]
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: botApi.reset,
    onSuccess: () => {
      qc.setQueryData(["bot", "history", "full"], []);
      qc.setQueryData(["bot", "history", "cotb"], []);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate(input.trim());
    setInput("");
  }

  const placeholder = mode === "cotb"
    ? "Text BigMo (COTB mode)…"
    : "Message BigMo…";

  const subtitle = mode === "cotb"
    ? "Chairman of the Boards — SMS mode"
    : "AI member of the Fonde Brotherhood";

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-white/60" />
          <span className="text-sm font-medium">BigMo</span>
          <span className="text-xs text-white/40">{subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending || history.length === 0}
            className="text-white/50 hover:text-white"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {history.length === 0 && (
            <p className="text-center text-white/30 text-sm py-8">
              {mode === "cotb" ? "What's the schedule, BigMo?" : "What's on your mind, Brother?"}
            </p>
          )}
          {history.map((entry, i) => (
            <BubbleRow key={i} entry={entry} />
          ))}
          {sendMutation.isPending && (
            <div className="flex items-end gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-[10px] bg-white/10"><Bot className="h-3 w-3" /></AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-lg px-3 py-2 text-sm text-white/50">…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-border max-w-2xl mx-auto w-full">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
          autoComplete="off"
          disabled={sendMutation.isPending}
        />
        <Button type="submit" size="icon" disabled={sendMutation.isPending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
