/// <reference types="vite/client" />
import { useEffect, useReducer, useRef } from "react";
import type { City, Cycle, Plan, Snapshot, TickerEvent } from "./types";

export interface IntakeItem {
  tick: number;
  text: string;
  tone: "info" | "warn" | "crit";
}

export interface ScenarioInfo {
  id: string;
  name: string;
  description: string;
  max_ticks: number;
  inject_count: number;
  active: boolean;
}

export interface AppState {
  city: City | null;
  snapshot: Snapshot | null;
  running: boolean;
  commander: string;
  cycles: Cycle[];
  events: TickerEvent[];
  intake: IntakeItem[];
  riskHistory: number[];
  hovered: string | null;
  overridden: Set<string>;
  scenarios: ScenarioInfo[];
  activeScenario: string;
  baselineHistory: number[];
  // Cumulative work of the model this run: surfaced in the header readout.
  aiStats: { tokens: number; directives: number; rejected: number; cycles: number; latencyTotal: number };
  // Honest, per-instance throughput for the public-reporting layer.
  reportStats: { triaged: number; dispatched: number; merged: number };
  // Human-in-the-loop: supervised = operator must accept; delegated = auto-execute.
  authority: "supervised" | "delegated";
  applied: Set<string>; // "{cycle}:{id}" directives that are executing
}

const initial: AppState = {
  city: null,
  snapshot: null,
  running: false,
  commander: "",
  cycles: [],
  events: [],
  intake: [],
  riskHistory: [],
  hovered: null,
  overridden: new Set(),
  scenarios: [],
  activeScenario: "",
  baselineHistory: [],
  aiStats: { tokens: 0, directives: 0, rejected: 0, cycles: 0, latencyTotal: 0 },
  reportStats: { triaged: 0, dispatched: 0, merged: 0 },
  authority: "supervised",
  applied: new Set(),
};

const freshRun = {
  cycles: [] as Cycle[],
  events: [] as TickerEvent[],
  intake: [] as IntakeItem[],
  riskHistory: [] as number[],
  baselineHistory: [] as number[],
  overridden: new Set<string>(),
  applied: new Set<string>(),
  aiStats: { tokens: 0, directives: 0, rejected: 0, cycles: 0, latencyTotal: 0 },
  reportStats: { triaged: 0, dispatched: 0, merged: 0 },
};

/** Synthesize the raw "city intake" feed by diffing consecutive snapshots:
 *  the sensor chatter an EOC actually watches scroll by. */
function diffIntake(prev: Snapshot | null, next: Snapshot, city: City | null): IntakeItem[] {
  const out: IntakeItem[] = [];
  const t = next.tick;
  const name = (id: string) => city?.nodes.find((n) => n.id === id)?.name ?? id;
  const pt = prev?.telemetry;
  const nt = next.telemetry;

  if (!pt || Math.abs(nt.tide_gauge_m - pt.tide_gauge_m) >= 0.15) {
    const d = pt ? nt.tide_gauge_m - pt.tide_gauge_m : 0;
    out.push({
      tick: t,
      text: `Tide gauge ${nt.tide_gauge_m.toFixed(2)}m${pt ? ` (${d > 0 ? "+" : ""}${d.toFixed(2)})` : ""}`,
      tone: nt.tide_gauge_m > 2 ? "warn" : "info",
    });
  }
  if (pt && Math.abs(nt.calls_911_per_min - pt.calls_911_per_min) >= 30) {
    const top = Object.entries(nt.calls_by_district ?? {}).sort((a, b) => b[1] - a[1])[0];
    out.push({
      tick: t,
      text: `911 at ${nt.calls_911_per_min}/min${top ? `, heaviest from ${name(top[0])}` : ""}`,
      tone: nt.calls_911_per_min > 300 ? "crit" : "warn",
    });
  }
  const prevOut = new Set(pt?.power_outage_nodes ?? []);
  for (const nid of nt.power_outage_nodes) {
    if (!prevOut.has(nid)) out.push({ tick: t, text: `Power lost in ${name(nid)}`, tone: "crit" });
  }
  const prevPumps = Object.fromEntries((pt?.pump_stations ?? []).map((p) => [p.node, p.status]));
  for (const p of nt.pump_stations) {
    if (prevPumps[p.node] && prevPumps[p.node] !== p.status)
      out.push({ tick: t, text: `${name(p.node)} ${p.status}, outflow ${p.outflow_pct}%`, tone: "crit" });
  }
  const prevHosp = Object.fromEntries((pt?.hospitals ?? []).map((h) => [h.node, h.generator_failed]));
  for (const h of nt.hospitals) {
    if (prevHosp[h.node] === false && h.generator_failed)
      out.push({ tick: t, text: `${h.name} generator down, ${h.patients_critical} critical`, tone: "crit" });
  }
  const blockedDelta = next.impassable_edges.length - (prev?.impassable_edges.length ?? 0);
  if (blockedDelta > 0)
    out.push({ tick: t, text: `${blockedDelta} more road segment${blockedDelta > 1 ? "s" : ""} impassable`, tone: "warn" });
  const prevSig = new Set((pt?.social_signals ?? []).map((s) => s.text));
  for (const s of nt.social_signals) {
    if (!prevSig.has(s.text))
      out.push({
        tick: t,
        text: `Social: "${s.text.slice(0, 64)}${s.text.length > 64 ? "…" : ""}" ${s.volume}/min`,
        tone: s.credibility === "unverified" ? "crit" : "info",
      });
  }
  // Contamination alerts
  const prevContam = new Set(prev?.contaminated_nodes ?? []);
  for (const nid of next.contaminated_nodes ?? []) {
    if (!prevContam.has(nid))
      out.push({ tick: t, text: `HAZMAT zone declared at ${name(nid)}`, tone: "crit" });
  }
  // Cell network degradation
  if (pt && nt.cell_network_pct < pt.cell_network_pct - 15) {
    out.push({
      tick: t,
      text: `Cell network dropped to ${nt.cell_network_pct}% — comms impaired`,
      tone: "crit",
    });
  }
  return out;
}

type Msg = Record<string, any>;
type Action =
  | { t: "city"; city: City }
  | { t: "ws"; msg: Msg }
  | { t: "hover"; id: string | null }
  | { t: "running"; v: boolean }
  | { t: "override"; key: string }
  | { t: "scenarios"; scenarios: ScenarioInfo[] }
  | { t: "report"; kind: "triaged" | "dispatched" | "merged" };

function upsertCycle(cycles: Cycle[], n: number, fn: (c: Cycle) => Cycle): Cycle[] {
  const idx = cycles.findIndex((c) => c.cycle === n);
  if (idx === -1) return [...cycles, fn({ cycle: n, tick: 0, reasoning: "", done: false })];
  const copy = cycles.slice();
  copy[idx] = fn(copy[idx]);
  return copy;
}

function reduce(s: AppState, a: Action): AppState {
  switch (a.t) {
    case "city":
      return { ...s, city: a.city };
    case "scenarios":
      return { ...s, scenarios: a.scenarios };
    case "report":
      return { ...s, reportStats: { ...s.reportStats, [a.kind]: s.reportStats[a.kind] + 1 } };
    case "hover":
      return { ...s, hovered: a.id };
    case "running":
      return { ...s, running: a.v };
    case "override": {
      const next = new Set(s.overridden);
      next.add(a.key);
      return { ...s, overridden: next };
    }
    case "ws": {
      const m = a.msg;
      switch (m.type) {
        case "sim_status":
          return { ...s, running: m.running };
        case "hello":
          return {
            ...s, commander: m.commander, running: m.running,
            snapshot: m.snapshot ?? s.snapshot,
            authority: m.authority === "delegated" ? "delegated" : "supervised",
          };
        case "authority":
          return { ...s, authority: m.mode === "delegated" ? "delegated" : "supervised" };
        case "directives_applied": {
          const next = new Set(s.applied);
          for (const id of m.directive_ids ?? []) next.add(`${m.cycle}:${id}`);
          return { ...s, applied: next };
        }
        case "state_snapshot": {
          const snap: Snapshot = m.snapshot;
          if (snap.tick < (s.snapshot?.tick ?? 0)) {
            // reset: start the run history fresh
            return {
              ...s, ...freshRun, snapshot: snap,
              riskHistory: [snap.casualties_at_risk],
              baselineHistory: [snap.baseline_risk ?? 0],
            };
          }
          const fresh = diffIntake(s.snapshot, snap, s.city);
          return {
            ...s,
            snapshot: snap,
            intake: [...fresh.reverse(), ...s.intake].slice(0, 30),
            riskHistory: [...s.riskHistory.slice(-119), snap.casualties_at_risk],
            baselineHistory: [...s.baselineHistory.slice(-119), snap.baseline_risk ?? 0],
          };
        }
        case "inject": {
          const ev = { tick: m.inject.tick, text: m.inject.headline, severity: m.inject.severity };
          return { ...s, events: [...s.events.slice(-39), ev] };
        }
        case "cycle_start":
          return { ...s, cycles: [...s.cycles.slice(-19), { cycle: m.cycle, tick: m.tick, reasoning: "", done: false }] };
        case "reasoning_token":
          return { ...s, cycles: upsertCycle(s.cycles, m.cycle, (c) => ({ ...c, reasoning: c.reasoning + m.text })) };
        case "reasoning_done":
          return { ...s, cycles: upsertCycle(s.cycles, m.cycle, (c) => ({ ...c, done: true })) };
        case "plan": {
          const plan: Plan = m.plan;
          const rejected = plan.directives.filter((d) => d.verified === false).length;
          return {
            ...s,
            cycles: upsertCycle(s.cycles, m.cycle, (c) => ({ ...c, done: true, plan, meta: m.meta })),
            aiStats: {
              tokens: s.aiStats.tokens + (m.meta?.tokens ?? 0),
              directives: s.aiStats.directives + plan.directives.length,
              rejected: s.aiStats.rejected + rejected,
              cycles: s.aiStats.cycles + 1,
              latencyTotal: s.aiStats.latencyTotal + (m.meta?.elapsed_s ?? 0),
            },
          };
        }
        case "cycle_degraded":
          return { ...s, cycles: upsertCycle(s.cycles, m.cycle, (c) => ({ ...c, done: true, degraded: m.reason })) };
        case "city_update":
          return { ...s, ...freshRun, city: m.city };
        case "scenario_loaded":
          return { ...s, ...freshRun, activeScenario: m.scenario };
        default:
          return s;
      }
    }
  }
}

export function useYaqzan() {
  const [state, dispatch] = useReducer(reduce, initial);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    // Resilient loaders: retry until the backend answers, so the map never
    // gets stuck on "Loading…" if it mounted during a backend restart.
    const getApiUrl = (path: string) => {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      return `${baseUrl}${path}`;
    };

    const getWsUrl = () => {
      if (import.meta.env.VITE_BACKEND_URL) {
        return import.meta.env.VITE_BACKEND_URL.replace(/^http/, "ws") + "/ws";
      }
      const proto = location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${location.host}/ws`;
    };

    const loadCity = (tries = 0) => {
      fetch(getApiUrl("/api/city"))
        .then((r) => r.json())
        .then((city) => { if (alive) dispatch({ t: "city", city }); })
        .catch(() => { if (alive && tries < 30) setTimeout(() => loadCity(tries + 1), 1000); });
    };
    const loadScenarios = (tries = 0) => {
      fetch(getApiUrl("/api/scenarios"))
        .then((r) => r.json())
        .then((scenarios) => { if (alive) dispatch({ t: "scenarios", scenarios }); })
        .catch(() => { if (alive && tries < 30) setTimeout(() => loadScenarios(tries + 1), 1000); });
    };
    loadCity();
    loadScenarios();

    function connect() {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        // Panel-local streams (chat, scenario designer, citizen reports) fan
        // out via custom event instead of the reducer.
        if (msg.type?.startsWith("chat_") || msg.type?.startsWith("scenario_gen_")
            || msg.type?.startsWith("report_") || msg.type === "citizen_report"
            || msg.type?.startsWith("live_event_")) {
          window.dispatchEvent(new CustomEvent("yaqzan_ws", { detail: msg }));
          // Honest throughput counters for the public-reporting layer.
          if (msg.type === "report_response") dispatch({ t: "report", kind: "triaged" });
          else if (msg.type === "report_op_applied") dispatch({ t: "report", kind: "dispatched" });
          else if (msg.type === "report_duplicate") dispatch({ t: "report", kind: "merged" });
          if (msg.type === "scenario_gen_done") {
            fetch(getApiUrl("/api/scenarios"))
              .then((r) => r.json())
              .then((scenarios) => dispatch({ t: "scenarios", scenarios }))
              .catch(() => {});
          }
        } else {
          dispatch({ t: "ws", msg });
        }
      };
      ws.onclose = () => {
        if (alive) setTimeout(connect, 1200);
      };
    }
    connect();
    return () => {
      alive = false;
      wsRef.current?.close();
    };
  }, []);

  const send = (msg: Record<string, unknown>) => wsRef.current?.send(JSON.stringify(msg));
  return { state, dispatch, send };
}
