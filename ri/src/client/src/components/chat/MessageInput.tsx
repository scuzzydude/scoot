import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../../api/chat.js";
import { Button } from "../ui/button.js";
import { Send } from "lucide-react";

interface Props {
  roomId: number;
}

export function MessageInput({ roomId }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: (content: string) =>
      chatApi.sendMessage(roomId, { content }),
    onSuccess: (msg) => {
      qc.setQueryData(
        ["chat", "messages", roomId],
        (prev: typeof msg[] | undefined) =>
          prev ? (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]) : [msg]
      );
      qc.invalidateQueries({ queryKey: ["chat", "rooms"] });
      setText("");
      textareaRef.current?.focus();
    },
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const content = text.trim();
    if (content && !send.isPending) send.mutate(content);
  }

  return (
    <div className="border-t border-white/10 px-3 py-2 flex items-end gap-2 shrink-0">
      <textarea
        ref={textareaRef}
        rows={1}
        className="flex-1 resize-none bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 border border-white/10 focus:outline-none focus:border-white/20 max-h-32 leading-relaxed"
        placeholder="Message… or @BigMo ask anything"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={4000}
      />
      <Button
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={!text.trim() || send.isPending}
        onClick={submit}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
