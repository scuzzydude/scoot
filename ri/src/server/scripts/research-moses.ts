import "dotenv/config";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { searchWeb } from "../services/search.js";

/*
 * research-moses.ts — scan the web for Moses Malone quotes, stories, and color
 * to enrich the BigMo personality. Uses the same searchWeb backend the bot uses
 * (Perplexity → Tavily → Gemini, per whichever API key is set).
 *
 * Output: ri/personalities/bigmo/source-moses-malone-web-research.md
 *
 * This is RAW research — search backends paraphrase and can get quotes/dates
 * wrong. Review before folding anything into personality.md. The hand-curated
 * source-moses-malone-biography.md remains the trusted reference.
 *
 * Run:  npm run research:moses
 */

const OUT = resolve(process.cwd(), "ri/personalities/bigmo/source-moses-malone-web-research.md");
const DELAY_MS = 1500; // be polite to the search API between calls

const QUERIES: { section: string; query: string }[] = [
  {
    section: "Famous & lesser-known quotes",
    query:
      "List direct quotes from Moses Malone (NBA player). For each, give the exact wording, the context, and the year if known. Include both famous lines and lesser-known ones.",
  },
  {
    section: "Humor & deadpan one-liners",
    query:
      "What funny, witty, or deadpan things did Moses Malone say? Give his humorous quotes and the stories behind them, with sources.",
  },
  {
    section: "On rebounding, work ethic & the game",
    query:
      "Direct quotes from Moses Malone about rebounding, hard work, effort, and his approach to basketball. Quote him exactly with context.",
  },
  {
    section: "Teammate & coach anecdotes",
    query:
      "Stories and anecdotes about Moses Malone told by teammates, coaches, and opponents. What was he like off the court? Include quotes about him.",
  },
  {
    section: "Mentoring Barkley & Olajuwon",
    query:
      "Detailed stories and quotes about Moses Malone mentoring Charles Barkley and Hakeem Olajuwon, including exact things he said to them.",
  },
  {
    section: "Fonde Recreation Center (Houston)",
    query:
      "Moses Malone and the Fonde Recreation Center in Houston: the legendary summer pickup games, who played there (Hakeem Olajuwon, Clyde Drexler, etc.), and any Moses Malone quotes or stories about Fonde.",
  },
  {
    section: "Speech patterns & mannerisms",
    query:
      "How did Moses Malone speak and carry himself? His speech impediment, southern Petersburg Virginia vernacular, mannerisms, and personality as described by those who knew him.",
  },
  {
    section: "Lesser-known life facts",
    query:
      "Lesser-known facts and stories about Moses Malone's life, personality, generosity, and habits away from basketball.",
  },
];

async function main(): Promise<void> {
  if (!process.env.PERPLEXITY_API_KEY && !process.env.TAVILY_API_KEY && !process.env.GEMINI_API_KEY) {
    process.stderr.write("No search API key set (PERPLEXITY_API_KEY / TAVILY_API_KEY / GEMINI_API_KEY).\n");
    process.exit(1);
  }

  const parts: string[] = [];
  parts.push("# Moses Malone — Web Research (auto-gathered)");
  parts.push(
    `> Generated ${new Date().toISOString()} by \`npm run research:moses\`. RAW, machine-gathered ` +
      "research — search backends paraphrase and can get quotes/dates wrong. **Verify before folding " +
      "into `personality.md`.** Trusted hand-curated reference is `source-moses-malone-biography.md`.\n",
  );

  let ok = 0;
  for (const { section, query } of QUERIES) {
    process.stdout.write(`Searching: ${section} …\n`);
    let result: string | null = null;
    try {
      result = await searchWeb(query);
    } catch (err) {
      process.stderr.write(`  failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    if (result) ok++;
    parts.push(`## ${section}\n\n*Query: ${query}*\n\n${result ?? "_(no result returned)_"}\n`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  writeFileSync(OUT, parts.join("\n") + "\n", "utf8");
  process.stdout.write(`\nWrote ${ok}/${QUERIES.length} sections to ${OUT}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`research-moses failed: ${err}\n`);
    process.exit(1);
  });
