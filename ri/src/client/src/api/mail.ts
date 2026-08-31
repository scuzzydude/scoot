export interface MailAccountSummary {
  id: number;
  label: string;
  emailAddress: string;
  isDreamlab: boolean;
  needsReauth: boolean;
  createdAt: string;
}

export interface MailFolder {
  path: string;
  name: string;
  unread: number;
}

export interface MailMessageSummary {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: string | null;
  unread: boolean;
  hasAttachments: boolean;
  snippet: string;
}

export interface MailAttachmentMeta {
  partId: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface MailMessageDetail {
  uid: number;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: string | null;
  textBody: string;
  htmlBody: string | null;
  attachments: MailAttachmentMeta[];
}

export interface LinkAccountInput {
  label: string;
  emailAddress: string;
  imapHost: string;
  imapPort?: number;
  imapUser: string;
  smtpHost: string;
  smtpPort?: number;
  smtpUser: string;
  password: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  attachments?: File[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/mail${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const mailApi = {
  permissions: () => apiFetch<{ canLinkNonDreamlab: boolean }>("/permissions"),
  listAccounts: () => apiFetch<MailAccountSummary[]>("/accounts"),
  linkAccount: (input: LinkAccountInput) =>
    apiFetch<{ id: number }>("/accounts", { method: "POST", body: JSON.stringify(input) }),
  reauthAccount: (accountId: number, password: string) =>
    apiFetch<null>(`/accounts/${accountId}/reauth`, { method: "POST", body: JSON.stringify({ password }) }),
  unlinkAccount: (accountId: number) =>
    apiFetch<null>(`/accounts/${accountId}`, { method: "DELETE" }),
  listFolders: (accountId: number) =>
    apiFetch<MailFolder[]>(`/accounts/${accountId}/folders`),
  listMessages: (accountId: number, folder: string) =>
    apiFetch<MailMessageSummary[]>(`/accounts/${accountId}/messages?folder=${encodeURIComponent(folder)}`),
  getMessage: (accountId: number, folder: string, uid: number) =>
    apiFetch<MailMessageDetail>(`/accounts/${accountId}/messages/${uid}?folder=${encodeURIComponent(folder)}`),
  attachmentUrl: (accountId: number, folder: string, uid: number, partId: string) =>
    `/api/v1/mail/accounts/${accountId}/messages/${uid}/attachments/${partId}?folder=${encodeURIComponent(folder)}`,
  moveMessage: (accountId: number, folder: string, uid: number, toFolder: string) =>
    apiFetch<null>(`/accounts/${accountId}/messages/${uid}/move?folder=${encodeURIComponent(folder)}`, {
      method: "POST",
      body: JSON.stringify({ toFolder }),
    }),
  send: async (accountId: number, input: SendMailInput): Promise<void> => {
    const form = new FormData();
    form.append("to", input.to);
    form.append("subject", input.subject);
    form.append("text", input.text);
    if (input.inReplyTo) form.append("inReplyTo", input.inReplyTo);
    for (const file of input.attachments ?? []) form.append("attachments", file);
    const res = await fetch(`/api/v1/mail/accounts/${accountId}/send`, { method: "POST", body: form });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "Send failed");
  },
};
