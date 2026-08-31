import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mailApi } from "../../api/mail.js";
import { toast } from "../../hooks/use-toast.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";
import { ShieldCheck, ShieldAlert } from "lucide-react";

const DREAMLAB_DOMAINS = ["thedreamlaboratory.org", "fairchildlabs.org"];
function looksLikeDreamlab(email: string): boolean {
  const v = email.trim().toLowerCase();
  if (v === "fonde.brotherhood@gmail.com") return true;
  const domain = v.split("@")[1];
  return !!domain && DREAMLAB_DOMAINS.includes(domain);
}

interface Preset {
  key: string;
  label: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  hint: string;
}
const PRESETS: Preset[] = [
  { key: "gmail", label: "Gmail", imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465,
    hint: "Needs a Google App Password (requires 2-Step Verification): myaccount.google.com/apppasswords" },
  { key: "outlook", label: "Outlook / Hotmail", imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587,
    hint: "Needs an app password from account.live.com/proofs/AppPassword" },
  { key: "zoho", label: "Zoho Mail", imapHost: "imappro.zoho.com", imapPort: 993, smtpHost: "smtppro.zoho.com", smtpPort: 465,
    hint: "Zoho Mail → Settings → Security → App Passwords" },
  { key: "custom", label: "Custom / other", imapHost: "", imapPort: 993, smtpHost: "", smtpPort: 465, hint: "" },
];

export function LinkAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: perms } = useQuery({ queryKey: ["mail", "permissions"], queryFn: mailApi.permissions });

  const [presetKey, setPresetKey] = useState("gmail");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [imapHost, setImapHost] = useState(PRESETS[0].imapHost);
  const [imapPort, setImapPort] = useState(PRESETS[0].imapPort);
  const [smtpHost, setSmtpHost] = useState(PRESETS[0].smtpHost);
  const [smtpPort, setSmtpPort] = useState(PRESETS[0].smtpPort);
  const [userField, setUserField] = useState("");
  const [password, setPassword] = useState("");

  const preset = PRESETS.find((p) => p.key === presetKey)!;
  const isDreamlab = looksLikeDreamlab(email);
  const blocked = !isDreamlab && perms && !perms.canLinkNonDreamlab;

  function applyPreset(key: string) {
    setPresetKey(key);
    const p = PRESETS.find((x) => x.key === key)!;
    setImapHost(p.imapHost);
    setImapPort(p.imapPort);
    setSmtpHost(p.smtpHost);
    setSmtpPort(p.smtpPort);
  }

  const link = useMutation({
    mutationFn: () =>
      mailApi.linkAccount({
        label: label || email,
        emailAddress: email,
        imapHost,
        imapPort,
        imapUser: userField || email,
        smtpHost,
        smtpPort,
        smtpUser: userField || email,
        password,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail", "accounts"] });
      toast({ title: "Account linked", description: email });
      onOpenChange(false);
      setLabel(""); setEmail(""); setUserField(""); setPassword("");
    },
    onError: (err: Error) => toast({ title: "Couldn't link account", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link an email account</DialogTitle>
          <DialogDescription>IMAP + app password — the same pattern BigMo already uses for its own mailbox.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${
                  presetKey === p.key ? "bg-white text-black border-white font-semibold" : "border-white/15 text-white/70 hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset.hint && <p className="text-xs text-white/40">{preset.hint}</p>}

          <div>
            <Label htmlFor="ml-label">Label</Label>
            <Input id="ml-label" placeholder="e.g. Personal Gmail" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ml-email">Email address</Label>
            <Input id="ml-email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ml-user">IMAP/SMTP username (if different from email)</Label>
            <Input id="ml-user" placeholder={email || "same as email"} value={userField} onChange={(e) => setUserField(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ml-imap-host">IMAP host</Label>
              <Input id="ml-imap-host" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ml-imap-port">IMAP port</Label>
              <Input id="ml-imap-port" type="number" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="ml-smtp-host">SMTP host</Label>
              <Input id="ml-smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ml-smtp-port">SMTP port</Label>
              <Input id="ml-smtp-port" type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label htmlFor="ml-pass">App password</Label>
            <Input id="ml-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {email.trim() && (
            <div className="flex gap-2 text-xs rounded-lg border border-white/15 p-3 text-white/70">
              {isDreamlab ? (
                <>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-white" />
                  <span><b className="text-white">Dreamlab address.</b> Any member can link this — no extra permission needed.</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 shrink-0 text-white" />
                  <span>
                    <b className="text-white">Not a dreamlab address.</b>{" "}
                    {perms?.canLinkNonDreamlab
                      ? "Linking personal accounts requires Leader access. You have it, so this is allowed."
                      : "Linking personal accounts requires Leader access — ask a Leader to link this one."}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!email || !imapHost || !smtpHost || !password || !!blocked || link.isPending}
            onClick={() => link.mutate()}
          >
            {link.isPending ? "Linking…" : "Link account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
