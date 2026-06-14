# Elevation plan: make the model unmissable

Goal: K2 Think V2 visible in every corner of the product, with evidence a
non-engineer can feel. Each item lists the change, where it surfaces, and why
it matters to a judge.

## A. Counterfactual baseline — "the number that wins the room"

**What**: at scenario load the engine silently runs the identical disaster
with no commander (same seed, deterministic). Every snapshot then carries
`baseline_risk` alongside the live `casualties_at_risk`.

**Surfaces**
- Bottom strip: a third counter, **Kept Out of Danger** = baseline minus
  actual, counting up live in green.
- Overview dashboard: dual-curve chart, "with Yaqzan" vs "no commander",
  with the gap shaded.

**Why**: it converts the demo from "an AI doing things" into a measured
intervention effect. Leadership audiences remember one number, not twelve
panels. Status: backend done, frontend pending.

## B. Chat that thinks out loud

**What**: the Ask-Commander chat currently hides reasoning. Rework:
the model is told to deliberate first and mark its reply with an `ANSWER:`
line; the server streams everything before the marker as `chat_reasoning`
and the rest as `chat_token`. If the marker never appears, the client
promotes the full text to the answer (degraded but never broken).

**Surfaces**: a collapsible "thinking" trace above each chat answer,
streaming live, auto-collapsing when the answer starts. Same trust
mechanism as the commander loop, now in Q&A.

**New preset chips** (each one is a demo beat):
- "Draft the public flood alert in Arabic and English" — bilingual K2,
  lands hard with a Gulf jury.
- "Generate an official SITREP for the governor"
- "Why did you deprioritize the southern districts? Defend the tradeoff."
- "What single decision would save the most lives right now?"

## C. Cumulative reasoning telemetry

**What**: accumulate per-cycle meta (tokens, latency, directives, verifier
rejections) in the frontend store.

**Surfaces**: a quiet mono readout in the header, e.g.
`38.2k tok reasoned · 41 directives · 3 rejected · 19s/decision`.
Quantifies the work of the mind on screen, updates all session.

## D. Human in the loop — command authority, not decoration

**What**: an explicit authority model, switchable live from the header:

- **SUPERVISED** (default): the commander proposes; nothing executes until
  the operator clicks Accept on a directive (or Accept All). Unapproved
  directives expire when the next cycle replans, and the expiry is traced.
- **DELEGATED**: verified directives execute automatically; the operator
  retains per-directive Override. This is the film-flow mode.

**Mechanics**
- Backend: `CommanderLoop` stops auto-applying in supervised mode and holds
  a pending set; new WS commands `set_authority`, `accept_directive`,
  `accept_all`; every accept/override/expiry lands in the JSONL trace, so
  the audit trail shows the *human* decisions next to the model's.
- Frontend: Plan panel shows Accept / Override on each pending card and an
  Accept All action; applied directives flip to an EXECUTING badge; the
  header gains the authority toggle and the telemetry readout counts
  operator overrides alongside model stats.

**Why**: "advises, never commands" must be structural to be credible. A
judge watching the operator approve, reject, and out-rank the model in one
flow understands the safety architecture without being told.

## E. Sync pacing (done)

Sim time holds while the commander is mid-cycle (`COMMANDER_SYNC`, default
on): accelerated time never outruns the real reasoning endpoint, and the
"K2 is reasoning over the city state" hold state replaces a dead panel
during the endpoint's long time-to-first-byte.

## F. Prompt-to-disaster: K2 authors the scenario it will fight

**What**: type a disaster brief ("supertanker breach floods the harbor at
2am during a festival; pumps fail early") and K2 generates a complete,
runnable scenario: hazard parameters, seeded rainfall curve, water sources,
and a timed inject arc (calm, escalation, cascade, recovery). The sim runs
it deterministically; the same model then commands the response under
human supervision. Red team and blue team, one model, human above both.

**Scope guard (deliberate)**: generation targets the existing hand-crafted
Al-Sidra graph; the model authors the *disaster*, not the city. This keeps
the verifier's closed world intact, keeps every generated run seeded and
re-filmable, and keeps the filmed map at hand-tuned quality.

**Mechanics**
- `GeneratedScenario` pydantic contract: name, description, seed, ticks
  (30-90), surge rate, 8-16 rainfall control points (backend interpolates
  to the full curve), water sources (existing coastal node ids only), and
  injects restricted to the engine's working effect vocabulary
  (surge_rate_m, water_spike, destroy_edge, hospital_generator_down,
  crowd_surge, power_outage, cell_degradation, add_water_source,
  contaminate).
- A scenario validator mirrors the directive verifier: unknown node/edge
  ids, out-of-range ticks, or unknown effects produce a model-readable
  error and one repair round-trip; second failure surfaces a designed
  error state, never a crash.
- Generation streams its reasoning live into the Simulator panel: the
  audience watches K2 design the disaster before it fights it.
- Output is saved as `scenarios/generated_<slug>.json` with the authoring
  prompt embedded, appears in the scenario selector, and auto-loads.
- Offline fallback: a deterministic template generator keyed off prompt
  keywords, so the feature demos without credentials.

**Why**: this answers "is it just one canned script?" in the strongest
possible way: the jury can speak a disaster into existence and watch the
full loop (generate, simulate, reason, verify, human approval) run on it.

## G. Verification + docs

- pytest green, frontend build clean, live run screenshot.
- Update `docs/REASONING_LOOP.md` with the measured K2 V2 integration
  findings (the things judges cannot fake-check):
  - trace format is neither `reasoning_content` nor `<think>`; CoT arrives
    as plain content, plan in a trailing fenced block (handled by a
    streaming fence splitter),
  - server holds SSE headers while the model reasons (TTFB up to ~3 min on
    large prompts) — buffer-tolerant client + degradation path,
  - the 8192-token cap truncated plans (35k chars of CoT, no JSON);
    fixed with a 16k cap plus a TEMPO budget rule in the system prompt.

## Sequencing

1. frontend types/store (baseline history, ai stats)
2. BottomStrip counter + OverviewDash dual curve
3. backend chat split + ChatPanel thinking UI + chips
4. header telemetry readout
5. tests, build, live verify, REASONING_LOOP.md update
