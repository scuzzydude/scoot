import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { mailApi } from "../../api/mail.js";
import { toast } from "../../hooks/use-toast.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";
import { Textarea } from "../ui/textarea.js";
import { Paperclip, Send } from "lucide-react";

export interface ComposeSeed {
  to?: string;
  subject?: string;
  body?: string;
  inReplyTo?: string;
}

export function ComposeDialog({
  open,
  onOpenChange,
  accountId,
  accountLabel,
  seed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: number | null;
  accountLabel?: string;
  seed?: ComposeSeed;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (open) {
      setTo(seed?.to ?? "");
      setSubject(seed?.subject ?? "");
      setBody(seed?.body ?? "");
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = useMutation({
    mutationFn: () => {
      if (!accountId) throw new Error("No account selected");
      return mailApi.send(accountId, { to, subject, text: body, inReplyTo: seed?.inReplyTo, attachments: files });
    },
    onSuccess: () => {
      toast({ title: "Sent" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Send failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{seed?.inReplyTo ? "Reply" : "Compose"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {accountLabel && <p className="text-xs text-white/40">From {accountLabel}</p>}
          <div>
            <Label htmlFor="cp-to">To</Label>
            <Input id="cp-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="someone@example.com" />
          </div>
          <div>
            <Label htmlFor="cp-subject">Subject</Label>
            <Input id="cp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cp-body">Message</Label>
            <Textarea id="cp-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer w-fit">
              <Paperclip className="h-3.5 w-3.5" />
              {files.length > 0 ? `${files.length} attachment${files.length > 1 ? "s" : ""}` : "Attach files"}
              <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Discard</Button>
          <Button disabled={!to || !subject || send.isPending} onClick={() => send.mutate()}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
