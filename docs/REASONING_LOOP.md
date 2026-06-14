# The Reasoning Loop — design decisions

This is the file to read if you want to know *why* the K2 loop is built the way it is,
including what failed during tuning.

## Cycle cadence

A cycle runs every **3 ticks (~6 s wall time)** or immediately on a **critical-severity
inject**. Why not every tick? Three reasons:

1. The world must change enough between cycles for the re-plan to be legible. At
   1-tick cadence the model restates the previous plan with noise; at 3 ticks each
   cycle has a visible delta to react to.
2. Cycles are strictly sequential — a cycle reasons against the snapshot it was given.
   If the sim outruns the commander, we *skip to the latest snapshot* rather than queue
   stale ones (a commander reasoning about a city 20 seconds old is worse than silent).
3. Critical injects (levee breach, hospital generator failure) bypass the cadence —
   the commander reacts on the same tick the inject lands. That's the demo beat where
   the reasoning stream visibly pivots mid-disaster.

## State compaction

The world state is serialized fresh each cycle (~2–4 K tokens): flooded nodes with
depth/population/waiting counts, top-6 911 hotspots, shelters with remaining capacity,
unit positions/status, impassable edges, active injects, social signals. **No raw
history is ever sent.** Continuity comes from two compact artifacts instead:

- the **previous plan** (directive ids + verifier verdicts only), and
- a **delta list** ("Souq Causeway collapsed; bus_2 BLOCKED — no passable route;
  Shelter North at 92%") computed from the engine event log.

Stable key ordering keeps the system prompt and state shape cache-friendly.

## Output contract + repair loop

Plans are parsed from the **last fenced JSON block** and validated with pydantic
(strict literals, max 8 directives). On failure the validation error is sent back
verbatim with "re-emit ONLY the corrected JSON block" — one repair round-trip. On a
second failure the cycle is marked `degraded`, the previous plan stands, and the UI
shows a deliberate amber "commander re-evaluating" pulse instead of a spinner or a
crash. The loop has no path that raises out of `run_cycle`.

A fallback parser also accepts a bare trailing `{...}` object, because reasoning models
sometimes drop the fence after a long CoT.

## The verifier, and why rejections are displayed

Every directive is checked against engine ground truth *before* display: targets exist,
referenced routes are passable for that unit class (boats ignore flooded edges; buses
don't), shelters have remaining capacity, and **no directive moves civilians into a node
with water above half its elevation**. Failures render with a red "rejected by verifier"
badge and the reason — deliberately visible. Hiding them would make the system look
better and be worth less: the visible rejection *is* the safety architecture.

Rejections are then fed into the next cycle's prompt under a "VERIFIER REJECTIONS
(ground truth)" header. In closed-loop runs this produces observable in-session
correction: cycle N tries to evacuate the coast by bus, the verifier rejects it
(no passable route), cycle N+1 re-tasks boats and says why.

## What the real K2 V2 endpoint actually does (measured)

Integration findings from first live contact (June 2026), kept here because
each one changed the code:

- **Trace format is neither documented variant.** No `reasoning_content`
  delta field, no `<think>` tags: the chain-of-thought arrives as plain
  `content`, with the plan in a trailing fenced block. The client streams
  everything as reasoning until the first code fence, then switches
  (`_FenceSplitter`), holding back a 3-char tail so a fence split across
  SSE chunks is not missed.
- **The server holds SSE headers while the model reasons.** Time-to-first-
  byte on a ~8 KB commander prompt measured at 60-180 s, then the entire
  completion arrives in under a second. Read timeout raised to 300 s;
  the loop's skip-to-latest-snapshot design absorbs the latency.
- **The default token cap silently destroyed plans.** At `max_tokens=8192`
  the model spent the whole budget deliberating (35k chars of CoT) and was
  truncated before the JSON. Fix was twofold: cap raised to 16384 AND a
  TEMPO rule in the system prompt (at most 10 numbered steps, under 400
  words, then emit). The first compliant live plan: 8 directives, all
  verifier-approved, including boat-only evacuation of exactly the three
  severely flooded coastal districts.
- **Usage chunks carry an empty `choices` array** and crashed the naive
  SSE parser; now skipped.
- **Chat needed its own contract.** For conversational Q&A the plan-fence
  split is wrong, so chat uses a raw stream plus an explicit `ANSWER:`
  marker the model is instructed to emit; deliberation streams to the UI
  as a collapsible thinking trace, and if the marker never arrives the
  client promotes the full text rather than showing nothing.

## What failed during tuning

- **Per-tick cycles** produced repetitive plans and starved the token stream of drama.
  Fixed by the 3-tick cadence + critical-inject preemption.
- **Sending event history** blew the context budget within 15 cycles and made the model
  re-litigate old decisions. Replaced with the delta list.
- **Letting the commander own movement** (early sketch) made runs unreproducible and
  let a bad plan teleport units. The engine now owns physics; the commander owns intent.
- **Empty mid-crisis cycles**: when all transport was committed, the planner went
  silent for minutes of demo time. Fix: vertical-evacuation alerts as a real action —
  a `broadcast_alert` measurably reduces exposure in the engine, so "warn the districts
  you cannot reach" became both honest doctrine and visible activity.
- **Double-counting risk**: mobilized evacuees were counted on top of district
  population. Fixed by tracking `evacuated_from` per node and subtracting.

## The scripted commander

`ScriptedCommander` implements the same streaming interface as the K2 client and reasons
heuristically over the same world-state JSON. It exists so that (a) the entire product
runs and demos with zero network access, (b) tests have a deterministic plan source, and
(c) the K2 integration is a *swap*, not a build: when credentials arrive, only
`K2Client` and the trace-format parser need the smoke test
(`tests/test_k2_smoke.py`, skipped unless env vars are set).

It is deliberately a *plausible officer, not a genius* — it picks shelters without
re-checking water depth, so the verifier visibly catches it when Heritage Square floods.
With K2 in the chair, the verifier plays the same role against a much stronger planner.
