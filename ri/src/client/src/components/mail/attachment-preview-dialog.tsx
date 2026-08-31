import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog.js";
import { Button } from "../ui/button.js";
import { Download } from "lucide-react";
import type { MailAttachmentMeta } from "../../api/mail.js";

const INLINE_PDF = "application/pdf";

export function AttachmentPreviewBody({ attachment, url }: { attachment: MailAttachmentMeta; url: string }) {
  const isImage = attachment.contentType.startsWith("image/");
  const isPdf = attachment.contentType === INLINE_PDF;

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center overflow-hidden min-h-[220px]">
        {isImage ? (
          <img src={url} alt={attachment.filename} className="max-w-full max-h-[55vh] object-contain" />
        ) : isPdf ? (
          <embed src={url} type="application/pdf" className="w-full h-[55vh]" />
        ) : (
          <div className="p-8 text-center text-sm text-white/50">
            No inline preview for this file type yet — download to view.
          </div>
        )}
      </div>
      <Button variant="outline" asChild className="mt-3 w-full">
        <a href={url} download={attachment.filename}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download
        </a>
      </Button>
    </>
  );
}

export function AttachmentPreviewDialog({
  open,
  onOpenChange,
  attachment,
  url,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  attachment: MailAttachmentMeta | null;
  url: string | null;
}) {
  if (!attachment || !url) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{attachment.filename}</DialogTitle>
          <DialogDescription>
            {attachment.contentType} · {(attachment.size / 1024).toFixed(0)} KB
          </DialogDescription>
        </DialogHeader>
        <AttachmentPreviewBody attachment={attachment} url={url} />
      </DialogContent>
    </Dialog>
  );
}
