// Mail digest query interface — transport-agnostic core.
// Mirrors card-commands.ts architecture: this layer does the DB query and
// decides what to return (no transport coupling); SMS and webchat wrappers
// call this and deliver via their own channels (throttledSend vs postBotMessage).
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { mailDigestEntries, mailAccounts } from "../db/schema.js";

export interface DigestEntry {
  subject: string;
  fromAddress: string;
  category: "marketing" | "content";
  summary: string | null;
  isCritical: boolean;
  criticalInfo: string | null;
}

export interface DigestResult {
  entries: DigestEntry[];
  totalCount: number;
  criticalCount: number;
}

// Query digest entries for a user (owner-only, no Leader bypass).
// Returns recent entries with critical ones prioritized.
export async function resolveMailDigestCommand(
  userId: number,
  trimmed: string
): Promise<DigestResult | null> {
  // Recognize digest query phrases: "my digest", "email digest", "critical emails", etc.
  if (
    !/(digest|critical|important).*(email|mail|account)|email.*(digest|critical|summary)/i.test(trimmed)
  ) {
    return null;
  }

  // Query mailDigestEntries for all this user's mail accounts (owner-only)
  const rawEntries = await db
    .select({
      subject: mailDigestEntries.subject,
      fromAddress: mailDigestEntries.fromAddress,
      category: mailDigestEntries.category,
      summary: mailDigestEntries.summary,
      isCritical: mailDigestEntries.isCritical,
      criticalInfo: mailDigestEntries.criticalInfo,
    })
    .from(mailDigestEntries)
    .innerJoin(mailAccounts, eq(mailDigestEntries.mailAccountId, mailAccounts.id))
    .where(eq(mailAccounts.userId, userId))
    .limit(50);

  // Cast category to the correct union type and sort
  const entries: DigestEntry[] = rawEntries.map(e => ({
    ...e,
    category: e.category as "content" | "marketing",
  }));

  // Sort manually to put critical=true first
  const sorted = entries.sort((a, b) => {
    if (a.isCritical !== b.isCritical) return b.isCritical ? -1 : 1;
    return 0;
  });

  const criticalCount = sorted.filter((e) => e.isCritical).length;
  const totalCount = sorted.length;

  if (totalCount === 0) {
    // Return null so the handler falls through to the next one (or LLM)
    // rather than occupying a response slot with "no digest found"
    return null;
  }

  return { entries: sorted, totalCount, criticalCount };
}

// Format DigestResult for SMS/text delivery (concise)
export function formatDigestForSMS(result: DigestResult): string {
  if (result.entries.length === 0) return "No digest entries found.";

  const critical = result.entries.filter((e) => e.isCritical);
  const lines = [];

  if (critical.length > 0) {
    lines.push(`🚨 ${critical.length} CRITICAL:`);
    critical.slice(0, 3).forEach((e) => {
      lines.push(`  • ${e.fromAddress}: ${e.subject.slice(0, 40)}`);
      if (e.criticalInfo) lines.push(`    ⚠️  ${e.criticalInfo.slice(0, 50)}`);
    });
    if (critical.length > 3) lines.push(`  … and ${critical.length - 3} more`);
  }

  const content = result.entries.filter((e) => !e.isCritical);
  if (content.length > 0) {
    lines.push(`📧 ${content.length} messages:`);
    content.slice(0, 3).forEach((e) => {
      const preview = e.summary ? e.summary.slice(0, 40) : "[no summary]";
      lines.push(`  • ${e.fromAddress}: ${preview}`);
    });
    if (content.length > 3) lines.push(`  … and ${content.length - 3} more`);
  }

  return lines.join("\n");
}

// Format DigestResult for webchat (richer, can include more detail)
export function formatDigestForWebchat(result: DigestResult): string {
  if (result.entries.length === 0) return "No digest entries found.";

  const lines = [`**Email Digest** — ${result.totalCount} entries, ${result.criticalCount} critical`];

  const critical = result.entries.filter((e) => e.isCritical);
  if (critical.length > 0) {
    lines.push(`\n**🚨 Critical (${critical.length})**`);
    critical.forEach((e) => {
      lines.push(`- **${e.fromAddress}**: ${e.subject}`);
      if (e.criticalInfo) lines.push(`  > ⚠️  ${e.criticalInfo}`);
    });
  }

  const content = result.entries.filter((e) => !e.isCritical);
  if (content.length > 0) {
    lines.push(`\n**📧 Messages (${content.length})**`);
    content.forEach((e) => {
      lines.push(`- **${e.fromAddress}**: ${e.subject}`);
      if (e.summary) lines.push(`  > ${e.summary}`);
    });
  }

  return lines.join("\n");
}

// SMS wrapper: integrates into bigmo.ts handler chain.
export async function tryHandleMailDigestCommand(userId: number, trimmed: string): Promise<string | null> {
  const result = await resolveMailDigestCommand(userId, trimmed);
  if (!result) return null;
  return formatDigestForSMS(result);
}
