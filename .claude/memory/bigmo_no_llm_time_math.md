---
name: bigmo_no_llm_time_math
description: BigMo must never compute dates/times itself — deterministic schedule facts only; wrong times to seniors is the cardinal sin
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a3a73736-523a-4447-bf55-a6166bfcbe17
---

BigMo (the Fonde Brotherhood SMS bot) must NEVER let the LLM compute or restate dates, days-of-week, or clock times. The audience is 55+ seniors and texting one the wrong day/time is the one unacceptable error.

**Why:** LLMs are unreliable at date arithmetic and will parrot a time a user asserts. Real pre-fix logs showed BigMo replying "Monday 4:12pm Central, like you said" and inventing "10am, forty minutes from now." Giving the model correct input does NOT guarantee correct output.

**How to apply:**
- Schedule/time facts are computed deterministically in `ri/src/server/llm/schedule.ts` (`scheduleFacts()` / `withScheduleContext()`) against the Azure NTP clock in `America/Chicago`, then injected as a "Verified Schedule" block. The LLM only phrases them.
- Standing schedule lives in `SESSIONS` in that file (Tue 3:30–6pm, Sat 10am–noon, Fonde Rec Center) — single source of truth.
- Personality file `ri/personalities/bigmo/cotb.md` forbids computing dates/times and says to use the verified block verbatim or say "don't have that in front of me."
- Do NOT switch to shelling out to `date` — `new Date()`/`Intl` reads the same NTP clock; the injection mechanism was never the problem.

Meta-lesson for me: I have no clock in context (harness gives only the date). Run `date` for the real time — never answer time questions from my head. See [[infra_prod_server]], [[infra_claude_runs_on_steve]].
