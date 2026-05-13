#!/usr/bin/env node
// Save a Claude Code session into the repo as both raw JSONL and a clean
// human-readable markdown transcript. Defaults to the most recently modified
// session in this project's claude-state directory.
//
// Usage:
//   node scripts/save-session.js                # latest session, auto title
//   node scripts/save-session.js <session-id>   # specific session
//   node scripts/save-session.js --title="Some title"
//
// Outputs to docs/sessions/YYYY-MM-DD-<slug>.{jsonl,md}

const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
let sessionId = null;
let titleOverride = null;
for (const a of args) {
  if (a.startsWith('--title=')) titleOverride = a.slice('--title='.length);
  else if (!a.startsWith('--')) sessionId = a;
}

const PROJECT_SLUG = '-home-scuzzydude-projects-scoot';
const STATE_DIR = path.join(os.homedir(), '.claude', 'projects', PROJECT_SLUG);
const OUT_DIR = path.join(__dirname, '..', 'docs', 'sessions');

function pickLatestSession() {
  const files = fs.readdirSync(STATE_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, m: fs.statSync(path.join(STATE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) throw new Error(`no sessions found in ${STATE_DIR}`);
  return files[0].f.replace(/\.jsonl$/, '');
}

if (!sessionId) sessionId = pickLatestSession();
const jsonlPath = path.join(STATE_DIR, `${sessionId}.jsonl`);
if (!fs.existsSync(jsonlPath)) {
  console.error(`session not found: ${jsonlPath}`);
  process.exit(1);
}

const entries = fs.readFileSync(jsonlPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

let aiTitle = titleOverride;
let firstTimestamp = null;
for (const e of entries) {
  if (!aiTitle && e.type === 'ai-title' && e.aiTitle) aiTitle = e.aiTitle;
  if (!firstTimestamp && e.timestamp) firstTimestamp = e.timestamp;
}
if (!aiTitle) aiTitle = 'session';

const dateStr = (firstTimestamp ? new Date(firstTimestamp) : new Date())
  .toISOString().slice(0, 10);

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const baseName = `${dateStr}-${slugify(aiTitle)}`;
const outJsonl = path.join(OUT_DIR, `${baseName}.jsonl`);
const outMd = path.join(OUT_DIR, `${baseName}.md`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.copyFileSync(jsonlPath, outJsonl);

// Build clean markdown transcript.
// Strip:
//   - thinking blocks
//   - tool_result blocks coming back as user messages (replace with [tool result])
//   - <system-reminder>...</system-reminder> noise inside user prompts
//   - <command-name>/<command-message>/<command-args> CLI-internals tags
// Summarize tool_use blocks inline as italic one-liners.

function stripSystemReminders(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .trim();
}

function summarizeToolUse(b) {
  const name = b.name || 'tool';
  const input = b.input || {};
  let detail = '';
  if (name === 'Bash') detail = (input.description || input.command || '').toString().slice(0, 120);
  else if (name === 'Read') detail = input.file_path || '';
  else if (name === 'Edit' || name === 'Write') detail = input.file_path || '';
  else if (name === 'Agent') detail = input.description || '';
  else detail = Object.keys(input).slice(0, 3).join(',');
  return `*[${name}${detail ? ': ' + detail : ''}]*`;
}

const lines = [];
lines.push(`# ${aiTitle}`);
lines.push('');
lines.push(`> Session ID: \`${sessionId}\``);
lines.push(`> Date: ${dateStr}`);
lines.push(`> Raw JSONL: \`${path.relative(path.join(__dirname, '..'), outJsonl)}\``);
lines.push('');
lines.push('---');
lines.push('');

let lastRole = null;
for (const e of entries) {
  if (e.type !== 'user' && e.type !== 'assistant') continue;
  const msg = e.message || {};
  const role = msg.role;
  const content = msg.content;

  if (role === 'user') {
    let text = '';
    if (typeof content === 'string') {
      text = stripSystemReminders(content);
    } else if (Array.isArray(content)) {
      const textBlocks = content.filter(b => b.type === 'text').map(b => stripSystemReminders(b.text || ''));
      const toolResults = content.filter(b => b.type === 'tool_result');
      text = textBlocks.join('\n').trim();
      if (!text && toolResults.length) continue; // skip pure-tool-result echoes
    }
    if (!text) continue;
    if (lastRole !== 'user') {
      lines.push('## You');
      lines.push('');
    }
    lines.push(text);
    lines.push('');
    lastRole = 'user';
  } else if (role === 'assistant') {
    if (!Array.isArray(content)) continue;
    const parts = [];
    for (const b of content) {
      if (b.type === 'text' && b.text) parts.push(stripSystemReminders(b.text));
      else if (b.type === 'tool_use') parts.push(summarizeToolUse(b));
    }
    const joined = parts.join('\n').trim();
    if (!joined) continue;
    if (lastRole !== 'assistant') {
      lines.push('## Claude');
      lines.push('');
    }
    lines.push(joined);
    lines.push('');
    lastRole = 'assistant';
  }
}

fs.writeFileSync(outMd, lines.join('\n'));

const stat = fs.statSync(outMd);
console.error(`saved session ${sessionId}`);
console.error(`  raw : ${outJsonl} (${fs.statSync(outJsonl).size} bytes)`);
console.error(`  md  : ${outMd} (${stat.size} bytes)`);
