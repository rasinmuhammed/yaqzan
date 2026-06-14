# Architecture

Written for an engineer evaluating this repo. Yaqzan is deliberately small: a bespoke
reasoning loop over a deterministic simulation, with no agent framework in between —
the orchestration *is* the exhibit.

```
┌──────────────────────────────────────────────────────────┐
│ Frontend — React + Vite + Tailwind v4 + framer-motion    │
│   single-page War Room, one WebSocket, no router         │
├──────────────────────────────────────────────────────────┤
│ Backend — Python 3.12, FastAPI, fully async              │
│   SimulationEngine   tick loop, 2s/tick (configurable)   │
│   CommanderLoop      one K2 cycle / 3 ticks or critical  │
│   Verifier           every directive vs ground truth     │
│   TraceStore         append-only JSONL per run           │
├──────────────────────────────────────────────────────────┤
│ K2 Think V2 — OpenAI-compatible chat endpoint, streamed  │
│   (swappable with ScriptedCommander for offline runs)    │
└──────────────────────────────────────────────────────────┘
```

## Backend layout

| Module | Responsibility |
| --- | --- |
| `app/sim/city.py` | City graph (28 districts, ~50 roads), BFS routing |
| `app/sim/flood.py` | Head-driven flood propagation; seeded noise; deterministic |
| `app/sim/units.py` | Buses/boats/ambulances/rescue teams; engine-resolved movement |
| `app/sim/telemetry.py` | Synthesized city feeds: tide, rain, pumps, 911, traffic, grid, hospitals, social |
| `app/sim/engine.py` | Tick loop, timed injects, `StateSnapshot`; standalone CLI |
| `app/commander/k2_client.py` | Async streaming client; handles both reasoning-trace formats |
| `app/commander/scripted.py` | Offline heuristic commander behind the same interface |
| `app/commander/prompts.py` | All prompt templates (single source of truth) |
| `app/commander/schema.py` | Strict pydantic output contract + fenced-JSON extraction |
| `app/commander/verifier.py` | Ground-truth feasibility checks per directive |
| `app/commander/loop.py` | Cycle orchestration, repair round-trip, degradation |
| `app/trace/store.py` | JSONL audit trail |
| `app/main.py` | FastAPI, `/ws` hub, session lifecycle, film-mode inject triggers |

## Key decisions

**The sim is authoritative; K2 is advisory.** The engine owns physics: pathfinding, unit
movement, water propagation, casualty accounting. K2 issues *intent* (`evacuate
mangrove_quarter → university_city using boat_1, boat_2`); the engine resolves it. This
keeps the model inside a closed world it cannot corrupt, and makes every run reproducible.

**One snapshot type end-to-end.** `StateSnapshot` is broadcast verbatim to the frontend
and compacted (stable key order, top-N truncation) into the commander's world state.
There is no second representation to drift.

**Telemetry is synthesized, not faked.** 911 volume is a function of water depth ×
population; outages are elevation-gated; the rumor signal appears when the scenario
inject fires and collapses when a counter-broadcast directive is applied. Everything the
commander cites traces back to sim state.

**Commander behind a 2-method interface.** `K2Client` and `ScriptedCommander` both expose
`stream(messages) -> AsyncIterator[StreamEvent(kind=reasoning|content)]`. The loop,
verifier, traces, and UI are identical in both modes — which is also how the frontend and
the demo were built before API access arrived.

**WebSocket message types**: `hello`, `state_snapshot`, `inject`, `cycle_start`,
`reasoning_token`, `reasoning_done`, `plan`, `cycle_degraded`, `sim_status`,
`directive_overridden`. Control commands: `start`, `pause`, `reset`, `set_speed`,
`override_directive`, `trigger_inject`.

## Frontend

A single `useReducer` store fed by the WebSocket (`src/store.ts`). Panels:
`MapPanel` (pure SVG — no map library, full visual control), `ReasoningStream`
(live CoT with entity chips that highlight map elements on hover; collapsed cycle cards
form the audit trail), `PlanPanel` (directive cards, verifier badges, diff markers,
operator Override), `BottomStrip` (ticker, telemetry digits, at-risk sparkline, controls,
permanent K2 attribution). `?film=1` hides controls, enlarges type, and binds number keys
to scenario injects.

## Testing

`backend/tests` covers: determinism (same seed → identical snapshots), flood propagation,
unit movement and boat/road asymmetry, every verifier rule's failing case, fenced-JSON
extraction including the malformed→repair path, and a full closed-loop cycle with a mock
client. The scripted commander doubles as the deterministic fixture source.
