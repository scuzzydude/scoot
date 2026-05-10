import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { botApi, type BotHistoryEntry } from "../api/bot.js";
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

export default function BotPage() {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["bot", "history"],
    queryFn: botApi.getHistory,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => botApi.sendMessage(content),
    onMutate: (content) => {
      qc.setQueryData<BotHistoryEntry[]>(["bot", "history"], (prev) =>
        [...(prev ?? []), { role: "user", content }]
      );
    },
    onSuccess: ({ reply }) => {
      qc.setQueryData<BotHistoryEntry[]>(["bot", "history"], (prev) =>
        [...(prev ?? []), { role: "assistant", content: reply }]
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: botApi.reset,
    onSuccess: () => qc.setQueryData(["bot", "history"], []),
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

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-white/60" />
          <span className="text-sm font-medium">Scoot Bot</span>
        </div>
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

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {history.length === 0 && (
            <p className="text-center text-white/30 text-sm py-8">Ask me anything.</p>
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
          placeholder="Message the bot…"
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
