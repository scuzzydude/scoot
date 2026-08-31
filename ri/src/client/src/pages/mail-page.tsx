import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mailApi, type MailAttachmentMeta } from "../api/mail.js";
import { LinkAccountDialog } from "../components/mail/link-account-dialog.js";
import { ComposeDialog, type ComposeSeed } from "../components/mail/compose-dialog.js";
import { AttachmentPreviewDialog } from "../components/mail/attachment-preview-dialog.js";
import { Button } from "../components/ui/button.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import {
  Plus,
  ChevronLeft,
  Paperclip,
  Reply as ReplyIcon,
  PenSquare,
  MailWarning,
} from "lucide-react";

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function MailPage() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["mail", "accounts"], queryFn: mailApi.listAccounts });

  const [accountId, setAccountId] = useState<number | null>(null);
  const [folder, setFolder] = useState("INBOX");
  const [view, setView] = useState<"list" | "reading">("list");
  const [uid, setUid] = useState<number | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | undefined>(undefined);
  const [preview, setPreview] = useState<MailAttachmentMeta | null>(null);

  useEffect(() => {
    if (accountId === null && accounts.length > 0) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const account = accounts.find((a) => a.id === accountId) ?? null;

  const { data: folders = [] } = useQuery({
    queryKey: ["mail", "folders", accountId],
    queryFn: () => mailApi.listFolders(accountId!),
    enabled: accountId !== null,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["mail", "messages", accountId, folder],
    queryFn: () => mailApi.listMessages(accountId!, folder),
    enabled: accountId !== null,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["mail", "message", accountId, folder, uid],
    queryFn: () => mailApi.getMessage(accountId!, folder, uid!),
    enabled: accountId !== null && uid !== null && view === "reading",
  });

  function openMessage(u: number) {
    setUid(u);
    setView("reading");
  }
  function backToList() {
    setView("list");
    setUid(null);
    qc.invalidateQueries({ queryKey: ["mail", "messages", accountId, folder] });
  }

  function openReply() {
    if (!detail) return;
    setComposeSeed({
      to: detail.fromAddress,
      subject: detail.subject.toLowerCase().startsWith("re:") ? detail.subject : `Re: ${detail.subject}`,
      inReplyTo: String(detail.uid),
    });
    setComposeOpen(true);
  }
  function openCompose() {
    setComposeSeed(undefined);
    setComposeOpen(true);
  }

  if (accounts.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center space-y-4">
        <MailWarning className="h-8 w-8 mx-auto text-white/30" />
        <p className="text-sm text-white/60">No email accounts linked yet.</p>
        <Button onClick={() => setLinkOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Link an account
        </Button>
        <LinkAccountDialog open={linkOpen} onOpenChange={setLinkOpen} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {view === "list" ? (
        <>
          <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => { setAccountId(a.id); setFolder("INBOX"); }}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${
                  a.id === accountId ? "bg-white text-black border-white font-semibold" : "border-white/15 text-white/60 hover:bg-white/5"
                }`}
              >
                {a.label}
                {a.needsReauth ? " ⚠" : ""}
              </button>
            ))}
            <button
              onClick={() => setLinkOpen(true)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-white/15 text-white/60 hover:bg-white/5 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Link
            </button>
          </div>

          {account?.needsReauth && (
            <div className="mx-4 mt-2 rounded-lg border border-white/20 bg-white/5 p-3 text-xs text-white/70">
              This account needs to be reconnected — re-enter its app password.
            </div>
          )}

          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            {folders.length > 0 ? (
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="bg-transparent text-sm font-semibold border border-white/15 rounded-lg px-2 py-1"
              >
                {folders.map((f) => (
                  <option key={f.path} value={f.path} className="bg-black">
                    {f.name}{f.unread ? ` (${f.unread})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold">Inbox</span>
            )}
            <Button size="sm" variant="ghost" onClick={openCompose}>
              <PenSquare className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-13rem)]">
            {messagesLoading ? (
              <p className="text-center text-sm text-white/40 py-8">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-white/40 py-8">Nothing here.</p>
            ) : (
              messages.map((m) => (
                <button
                  key={m.uid}
                  onClick={() => openMessage(m.uid)}
                  className="w-full text-left border-b border-white/10 px-4 py-3 hover:bg-white/5 flex gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${m.unread ? "font-bold" : "font-medium text-white/80"}`}>{m.from}</p>
                    <p className="text-xs text-white/50 truncate">{m.subject}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-white/40 tabular-nums">{timeLabel(m.date)}</p>
                    {m.hasAttachments && <Paperclip className="h-3 w-3 text-white/30 mt-1 ml-auto" />}
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </>
      ) : (
        <div className="px-4 pt-3 pb-8">
          <Button variant="ghost" size="sm" onClick={backToList} className="mb-3 -ml-2">
            <ChevronLeft className="h-4 w-4 mr-1" /> Inbox
          </Button>

          {detailLoading || !detail ? (
            <p className="text-sm text-white/40 py-8 text-center">Loading…</p>
          ) : (
            <>
              <h1 className="text-lg font-bold leading-snug mb-3">{detail.subject}</h1>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-full bg-white text-black flex items-center justify-center text-xs font-bold shrink-0">
                  {detail.from.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{detail.from}</p>
                  <p className="text-xs text-white/40 truncate">to {detail.to}</p>
                </div>
              </div>

              {detail.htmlBody ? (
                <iframe
                  title="message body"
                  sandbox="allow-same-origin"
                  srcDoc={detail.htmlBody}
                  className="w-full rounded-lg border border-white/10 bg-white"
                  style={{ minHeight: 260 }}
                />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-line text-white/90">{detail.textBody}</p>
              )}

              {detail.attachments.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-white/40">
                    Attachments ({detail.attachments.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {detail.attachments.map((att) => (
                      <button
                        key={att.partId}
                        onClick={() => setPreview(att)}
                        className="flex items-center gap-2 border border-white/15 rounded-lg px-3 py-2 text-xs hover:bg-white/5"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-white/40" />
                        <span className="max-w-[140px] truncate">{att.filename}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <Button variant="outline" onClick={openReply}>
                  <ReplyIcon className="h-4 w-4 mr-1.5" /> Reply
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <LinkAccountDialog open={linkOpen} onOpenChange={setLinkOpen} />
      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accountId={accountId}
        accountLabel={account?.label}
        seed={composeSeed}
      />
      <AttachmentPreviewDialog
        open={preview !== null}
        onOpenChange={(v) => !v && setPreview(null)}
        attachment={preview}
        url={preview && accountId !== null && uid !== null ? mailApi.attachmentUrl(accountId, folder, uid, preview.partId) : null}
      />
    </div>
  );
}
