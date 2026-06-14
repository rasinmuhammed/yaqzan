export interface CityNode {
  id: string;
  name: string;
  x: number;
  y: number;
  elevation_m: number;
  population: number;
  is_shelter: boolean;
  shelter_capacity: number;
  is_hospital: boolean;
  is_pump_station: boolean;
  // Real-world grounding (OpenStreetMap, ODbL).
  lat?: number;
  lon?: number;
  osm?: {
    hospitals?: number;
    clinics?: number;
    schools?: number;
    colleges?: number;
    worship?: number;
    community?: number;
    hospital_names?: string[];
    shelter_names?: string[];
    source?: string;
  };
}

export interface CityEdge {
  id: string;
  a: string;
  b: string;
  name: string;
  mode?: "road" | "ferry";
  distance_km?: number;
  duration_min?: number;
}

export interface City {
  name: string;
  nodes: CityNode[];
  edges: CityEdge[];
  injects: { id: string; tick: number; severity: string; headline: string }[];
}

export interface NodeState {
  id: string;
  water_m: number;
  depth: "dry" | "ponding" | "flooded" | "severe";
  pop_present: number;
  evacuees_waiting: number;
  power: boolean;
  shelter_occupancy: number;
  contaminated: boolean;
}

export interface Unit {
  id: string;
  type: "bus" | "boat" | "ambulance" | "rescue_team";
  location: string;
  capacity: number;
  status: string;
  passengers: number;
  // Movement along the real road/ferry network.
  path?: string[];
  progress?: number;      // 0..1 along current_edge
  current_edge?: string | null;
}

export interface Telemetry {
  tide_gauge_m: number;
  rainfall_mm_hr: number;
  forecast_rain_mm_hr: number[];
  surge_outlook: string;
  wind_kts: number;
  calls_911_per_min: number;
  calls_by_district: Record<string, number>;
  traffic_congestion_pct: number;
  cell_network_pct: number;
  power_outage_nodes: string[];
  pump_stations: { node: string; status: string; outflow_pct: number }[];
  hospitals: {
    node: string;
    name: string;
    bed_occupancy_pct: number;
    on_backup_power: boolean;
    generator_failed: boolean;
    patients_critical: number;
  }[];
  social_signals: { text: string; volume: number; credibility: string }[];
  contamination_alerts: string[];
}

export interface Snapshot {
  tick: number;
  nodes: NodeState[];
  impassable_edges: string[];
  destroyed_edges: string[];
  units: Unit[];
  telemetry: Telemetry;
  active_injects: { id: string; severity: string; headline: string; tick: number }[];
  casualties_at_risk: number;
  baseline_risk: number;
  total_evacuated: number;
  alerts_broadcast: string[];
  contaminated_nodes: string[];
  severity_level: "normal" | "elevated" | "critical" | "extreme";
}

export interface Directive {
  id: string;
  action: string;
  target: string;
  params: Record<string, unknown>;
  rationale: string;
  urgency: "immediate" | "high" | "routine";
  verified: boolean | null;
  rejection_reason: string | null;
}

export interface Plan {
  cycle: number;
  situation_read: string;
  directives: Directive[];
  watching: string[];
  confidence: "high" | "medium" | "low";
}

export interface Cycle {
  cycle: number;
  tick: number;
  reasoning: string;
  done: boolean;
  plan?: Plan;
  degraded?: string;
  meta?: { elapsed_s: number; tokens: number };
}

export interface TickerEvent {
  tick: number;
  text: string;
  severity: string;
}
