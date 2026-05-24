import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../../api/chat.js";
import { Button } from "../ui/button.js";
import { Send, ImageIcon, X } from "lucide-react";

interface Props {
  roomId: number;
  sendWs: (data: unknown) => void;
}

export function MessageInput({ roomId, sendWs }: Props) {
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: async (content: string) => {
      let mediaUrl: string | undefined;
      if (pendingImage) {
        mediaUrl = await chatApi.uploadMedia(pendingImage);
      }
      return chatApi.sendMessage(roomId, { content, mediaUrl });
    },
    onSuccess: (msg) => {
      qc.setQueryData(
        ["chat", "messages", roomId],
        (prev: typeof msg[] | undefined) =>
          prev ? (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]) : [msg]
      );
      qc.invalidateQueries({ queryKey: ["chat", "rooms"] });
      setText("");
      setPendingImage(null);
      setImagePreview(null);
      textareaRef.current?.focus();
    },
  });

  const sendTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    sendWs({ type: "typing_client" });
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
    }, 2000);
  }, [sendWs]);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    if (e.target.value.length > 0) sendTyping();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const content = text.trim();
    if ((!content && !pendingImage) || send.isPending) return;
    send.mutate(content);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    e.target.value = "";
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setPendingImage(null);
    setImagePreview(null);
  }

  const canSend = (text.trim().length > 0 || pendingImage !== null) && !send.isPending;

  return (
    <div className="border-t border-white/10 px-3 py-2 flex flex-col gap-2 shrink-0">
      {imagePreview && (
        <div className="relative w-fit">
          <img
            src={imagePreview}
            alt="pending upload"
            className="h-20 rounded-lg object-cover border border-white/20"
          />
          <button
            type="button"
            onClick={clearImage}
            className="absolute -top-1.5 -right-1.5 bg-black border border-white/20 rounded-full p-0.5 text-white/70 hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0 text-white/40 hover:text-white"
          onClick={() => fileInputRef.current?.click()}
          disabled={send.isPending}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>

        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 resize-none bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 border border-white/10 focus:outline-none focus:border-white/20 max-h-32 leading-relaxed"
          placeholder="Message… or @BigMo ask anything"
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          maxLength={4000}
        />

        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={!canSend}
          onClick={submit}
        >
          {send.isPending ? (
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
