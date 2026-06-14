import { memo, useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════════════════════ */

const SvgIcon = ({ path, size = 18 }: { path: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const ICONS = {
  design: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  simulate: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z",
  reason: "M9 18h6 M10 22h4 M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  verify: "M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3",
  override: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z",
  reasoning: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  map: "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16",
  scenario: "M21.5 2v6h-6M2.13 15.57a9 9 0 103.44-7.44L2 10M2.5 22v-6h6",
  report: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  chat: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};

const PIPELINE = [
  { num: "01", title: "SCENARIO", sub: "The simulation is seeded", desc: "A fictional monsoon drill is loaded onto the real Kuttanad, Alappuzha (real towns, real roads, real elevation) modelled on the 2018 Kerala floods. A controlled environment to stress-test the AI's ability to command a real crisis.", icon: <SvgIcon path={ICONS.design} size={20} /> },
  { num: "02", title: "SIMULATE", sub: "Physics runs the disaster", desc: "A deterministic engine propagates floods, collapses roads, cascades power failures and chemical plumes. Every tick is reproducible. No randomness. Ground truth the AI must navigate.", icon: <SvgIcon path={ICONS.simulate} size={20} /> },
  { num: "03", title: "REASON", sub: "K2 Think V2 commands", desc: "K2 reads live telemetry and issues structured evacuation plans, resource deployments, and hospital triage priorities. Its full chain-of-thought is streamed and auditable in real time.", icon: <SvgIcon path={ICONS.reason} size={20} /> },
  { num: "04", title: "VERIFY", sub: "A grounded verifier checks", desc: "Every directive is cross-checked against actual simulation state. Road blocked? Rejected. Shelter at capacity? Rerouted. Hallucinations do not survive the verifier.", icon: <SvgIcon path={ICONS.verify} size={20} /> },
  { num: "05", title: "OVERRIDE", sub: "Human authority is final", desc: "Incident commanders review, approve, or veto any AI directive. The system operates in two modes: supervised approval and delegated auto-execution with single-click veto.", icon: <SvgIcon path={ICONS.override} size={20} /> },
];

const WHY_REASONING = [
  {
    icon: <SvgIcon path={ICONS.reasoning} size={22} />,
    title: "Dashboards describe. Reasoning acts.",
    desc: "Traditional emergency dashboards surface data but offload every decision to an overwhelmed operator. K2 Think V2 reads all inputs simultaneously, weighs tradeoffs, and issues a prioritised action plan with explicit rationale. The operator validates, not synthesises.",
  },
  {
    icon: <SvgIcon path={ICONS.chat} size={22} />,
    title: "Explainable decisions, not black-box alerts.",
    desc: "Reasoning models produce human-readable justification for every recommendation. When Yaqzan says 'prioritise Vandanam Medical College', it cites the water depth reading, generator-failure flag, and the critical-patient count. Commanders trust what they can read.",
  },
  {
    icon: <SvgIcon path={ICONS.shield} size={22} />,
    title: "Multi-variable coordination at machine speed.",
    desc: "A flood simultaneously blocks roads, overwhelms hospitals, and cuts power. No human operator can optimise across all constraints in parallel. A reasoning model can hold the entire city model in context and replan in seconds as conditions evolve.",
  },
  {
    icon: <SvgIcon path={ICONS.reason} size={22} />,
    title: "Why K2 Think V2 specifically.",
    desc: "Disaster command needs long-horizon, auditable reasoning over a large, contradictory world-state, and the chain-of-thought itself becomes the safety artifact a commander reviews. K2's extended deliberation is the point, not a side effect: every order arrives with the reasoning that produced it, grounded by a verifier and gated by a human.",
  },
];

// Real, cited figures from the August 2018 Kerala floods.
const KERALA_STATS = [
  { num: "483", label: "lives lost across Kerala, the heaviest flood in nearly a century" },
  { num: "5.4M", label: "people affected; over 800,000 displaced into 5,645 relief camps" },
  { num: "65,000", label: "marooned people rescued by fishermen in 669 country boats" },
  { num: "45,587", label: "rescue requests logged by 1.36M visitors on keralarescue.in" },
  { num: "~25%", label: "of those requests arrived duplicated and untriaged" },
];

const KERALA_SOURCES = [
  { label: "Kerala SDMA", url: "https://sdma.kerala.gov.in/floods_2018/" },
  { label: "Onmanorama", url: "https://www.onmanorama.com/news/kerala/2018/08/26/kerala-flood-fishermen-rescue.html" },
  { label: "NPR", url: "https://www.npr.org/sections/goatsandsoda/2018/08/22/640879582/how-social-media-came-to-the-rescue-after-keralas-flood" },
  { label: "Al Jazeera", url: "https://www.aljazeera.com/news/2018/8/19/huge-disaster-deadly-kerala-floods-displace-over-800000" },
  { label: "Crowdsourcing study", url: "https://www.researchgate.net/publication/341905720_Lessons_learned_from_deploying_crowdsourced_technology_for_disaster_relief_during_Kerala_floods" },
];

const FEATURES = [
  { icon: <SvgIcon path={ICONS.reasoning} size={22} />, title: "Live Reasoning Stream", desc: "Watch K2 think. Every observation, hypothesis, and decision streamed as tokens in real time." },
  { icon: <SvgIcon path={ICONS.map} size={22} />, title: "Physics-Based City Map", desc: "Topographic map of Kerala's backwaters with real flood propagation, road networks, and power grids." },
  { icon: <SvgIcon path={ICONS.scenario} size={22} />, title: "Crisis Scenarios", desc: "Monsoon deluge, dam releases, and cascading infrastructure failures. Each with unique dynamics." },
  { icon: <SvgIcon path={ICONS.report} size={22} />, title: "Citizen Incident Reports", desc: "Citizens submit reports. K2 triages them, authorities verify, escalation is automatic and logged." },
  { icon: <SvgIcon path={ICONS.chat} size={22} />, title: "Commander Intelligence Chat", desc: "Ask any operational question. Yaqzan responds citing district names, unit IDs, and sensor readings." },
  { icon: <SvgIcon path={ICONS.shield} size={22} />, title: "Human-in-the-Loop Control", desc: "Supervised or delegated authority. Approve directives one by one or let the verifier auto-execute." },
];

/* ─── Animated Orb ─── */
function HeroOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let t = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      t += 0.006;

      const cx = w / 2 + Math.sin(t * 0.7) * 18;
      const cy = h / 2 + Math.cos(t * 0.5) * 12;
      const r = Math.min(w, h) * 0.38;

      // Outer glow ring
      const glow = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.15);
      glow.addColorStop(0, "rgba(232,101,42,0.0)");
      glow.addColorStop(0.5, "rgba(232,101,42,0.06)");
      glow.addColorStop(1, "rgba(232,101,42,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Blue secondary glow
      const blueGlow = ctx.createRadialGradient(
        cx + Math.cos(t + 2) * r * 0.3,
        cy + Math.sin(t + 2) * r * 0.3,
        0,
        cx, cy, r * 0.9
      );
      blueGlow.addColorStop(0, "rgba(59,125,216,0.12)");
      blueGlow.addColorStop(1, "rgba(59,125,216,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = blueGlow;
      ctx.fill();

      // Core orb gradient
      const core = ctx.createRadialGradient(
        cx - r * 0.2, cy - r * 0.2, 0,
        cx, cy, r
      );
      core.addColorStop(0, "rgba(255,255,255,0.03)");
      core.addColorStop(0.4, "rgba(232,101,42,0.05)");
      core.addColorStop(0.75, "rgba(20,20,30,0.15)");
      core.addColorStop(1, "rgba(10,10,15,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();

      // Animated arc strokes
      for (let i = 0; i < 3; i++) {
        const angle = t * (0.4 + i * 0.15) + (i * Math.PI * 2) / 3;
        const arcR = r * (0.62 + i * 0.12);
        const arcSpan = Math.PI * (0.3 + Math.sin(t + i) * 0.1);
        ctx.beginPath();
        ctx.arc(cx, cy, arcR, angle, angle + arcSpan);
        ctx.strokeStyle = i === 1
          ? `rgba(232,101,42,${0.12 + Math.sin(t + i) * 0.05})`
          : `rgba(255,255,255,${0.04 + Math.sin(t + i) * 0.02})`;
        ctx.lineWidth = i === 1 ? 1.5 : 0.8;
        ctx.stroke();
      }

      // Floating particles
      for (let i = 0; i < 6; i++) {
        const angle = t * 0.3 + (i * Math.PI * 2) / 6;
        const dist = r * (0.55 + Math.sin(t * 0.8 + i * 1.2) * 0.12);
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        const pr = 1.5 + Math.sin(t + i) * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0
          ? `rgba(232,101,42,${0.3 + Math.sin(t + i) * 0.15})`
          : `rgba(180,200,255,${0.2 + Math.sin(t + i) * 0.1})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="landing-orb"
      aria-hidden="true"
    />
  );
}

export const LandingPage = memo(function LandingPage({
  onEnter,
  onGuide,
}: {
  onEnter: () => void;
  onGuide: () => void;
}) {
  const [vis, setVis] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    requestAnimationFrame(() => setVis(true));
    const iv = setInterval(() => setStep((s) => (s + 1) % PIPELINE.length), 4000);
    return () => clearInterval(iv);
  }, []);

  // Scroll reveal observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    const els = document.querySelectorAll(".reveal");
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [vis]);

  return (
    <div className={`landing ${vis ? "landing--visible" : ""}`}>
      <div className="landing-bg" />

      {/* ─── Nav ─── */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <div className="landing-hero-tagline" style={{ marginBottom: 0 }}>
            <div className="landing-hero-tagline-dot" />
            LIVE SIMULATION DEMO
          </div>
        </div>
        <div className="landing-nav-links">
          <a href="/report" className="landing-nav-link" style={{ color: "var(--brand)", fontWeight: 600 }}>Public Reporting</a>
          <button onClick={onGuide} className="landing-nav-link">How It Works</button>
          <button onClick={onEnter} className="landing-nav-link">Dashboard</button>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-logo-block">
            <img src="/yaqzan-logo.png" alt="" className="landing-hero-logo" />
            <div className="landing-hero-brand">
              <h1 className="landing-hero-name">YAQZAN</h1>
              <span className="landing-hero-arabic">يقظان</span>
            </div>
          </div>
          <h2 className="landing-hero-title">
            The reasoning engine between a<br />
            <em>crisis and its first responders.</em>
          </h2>
          <p className="landing-hero-sub">
            During a crisis, situational awareness is the difference between life and death. This live demo, tailored specifically to the vulnerable terrain of Kuttanad, illustrates how a reasoning model can serve as an AI Incident Commander. It processes citizen reports, triages emergencies, and builds strategic evacuation plans in real time. Humans retain ultimate authority; the AI provides the clarity needed to act.
          </p>
          <div className="landing-hero-sim-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            This is a simulated monsoon drill running on the real topography of Kuttanad, Alappuzha (the lowest-lying region in India), utilizing OpenStreetMap and NASA elevation data. The crisis dynamics are modelled after the catastrophic 2018 Kerala floods. By combining real geography with simulated disaster physics, we can accurately measure the AI's command capabilities against ground truth.
          </div>
          <div className="landing-hero-actions">
            <button onClick={onEnter} className="landing-cta-primary">
              <span className="relative flex h-2.5 w-2.5 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              Start Live API Demo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button onClick={onGuide} className="landing-cta-secondary">
              How It Works
            </button>
          </div>
        </div>
        <HeroOrb />
      </section>

      <div className="landing-demo-banner reveal" style={{ maxWidth: 1000, margin: "0 auto 80px", border: "1px solid var(--brand)", borderRadius: 12, padding: "24px 32px", backgroundColor: "rgba(232,101,42,0.05)" }}>
        <h3 style={{ color: "var(--brand)", fontSize: 13, fontWeight: "bold", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <SvgIcon path={ICONS.verify} size={16} /> Live Demo Architecture Note
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
          <div style={{ flex: 1 }}>
            <h4 style={{ color: "var(--ink-bright)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>1. Pre-seeded Macro Cycles</h4>
            <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6 }}>
              To ensure a seamless viewing experience, the main disaster timeline instantly streams pre-seeded, real AI reasoning traces. This eliminates the physical 15-second TTFT (Time To First Token) delay inherent to the live K2 API.
            </p>
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ color: "var(--ink-bright)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>2. Live Interactive API</h4>
            <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6 }}>
              The server remains fully wired to the live K2 API. Interactive actions—such as submitting an <strong>Incident Report</strong> or querying the <strong>Commander Chat</strong>—bypass the seeded trace and are processed dynamically by the real K2 AI.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Why Reasoning Models ─── */}
      <section className="landing-why reveal">
        <div className="landing-section-header">
          <span className="landing-section-tag">THE CASE FOR REASONING</span>
          <h2 className="landing-section-title">Why a reasoning model, not a dashboard?</h2>
          <p className="landing-section-sub">
            Emergency operators have always had data. What they lacked was a system that could read all of it at once, reason across competing priorities, and produce a concrete, justified action plan in seconds.
          </p>
        </div>
        <div className="landing-why-grid">
          {WHY_REASONING.map((w, i) => (
            <div key={i} className={`landing-why-card reveal delay-${(i % 2 + 1) * 100}`}>
              <div className="landing-why-icon">{w.icon}</div>
              <h3 className="landing-why-card-title">{w.title}</h3>
              <p className="landing-why-card-desc">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── The Meaning of Yaqzan ─── */}
      <section className="landing-meaning reveal">
        <div className="landing-meaning-inner">
          <h2 className="landing-meaning-title">
            Y A Q Z A N
            <span className="landing-meaning-arabic">يقظان</span>
          </h2>
          <p className="landing-meaning-text">
            Meaning "vigilant, awake, or alert" in Arabic.<br/>
            Because during a crisis, a system that never sleeps is the ultimate lifeline.
          </p>
        </div>
      </section>

      {/* ─── Why Reasoning Models ─── */}
      {/* ─── The real event: August 2018 Kerala floods ─── */}
      <section className="landing-kerala reveal">
        <div className="landing-section-header">
          <span className="landing-section-tag">WHAT ACTUALLY HAPPENED · KERALA, AUGUST 2018</span>
          <h2 className="landing-section-title">The heaviest flood in a century, and a state that crowdsourced its own rescue.</h2>
          <p className="landing-section-sub">
            During the devastating floods of August 2018, the people of Kerala mounted an unprecedented, massive crowdsourced rescue operation. A monumental IT effort led to the rapid deployment of keralarescue.in, saving countless lives. However, human operators faced an overwhelming challenge: triaging tens of thousands of duplicate and conflicting requests in real time. This demo explores how an AI reasoning model could enhance such heroic human efforts by instantly structuring and routing data at scale.
          </p>
        </div>
        <div className="landing-kerala-stats">
          {KERALA_STATS.map((s, i) => (
            <div key={i} className={`landing-kerala-stat reveal delay-${(i % 5 + 1) * 100}`}>
              <div className="landing-kerala-stat-num">{s.num}</div>
              <div className="landing-kerala-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="landing-kerala-bridge reveal">
          <span className="landing-kerala-bridge-rule" />
          <p>
            An AI Incident Commander can ingest every report, deduplicate the noise, reply to each person with safe instructions, and route human responders to a verified rescue, ensuring that critical signals are prioritized and coordinated at scale.
          </p>
        </div>
        <div className="landing-kerala-sources">
          Real figures, cited:
          {KERALA_SOURCES.map((src, i) => (
            <span key={i}>
              {i > 0 && <span className="landing-kerala-source-dot"> · </span>}
              <a href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
            </span>
          ))}
        </div>
      </section>

      <section className="landing-why reveal">
        <div className="landing-section-header">
          <span className="landing-section-tag">THE CASE FOR REASONING</span>
          <h2 className="landing-section-title">Why a reasoning model, not a dashboard?</h2>
          <p className="landing-section-sub">
            Emergency operators have always had data. What they lacked was a system that could read all of it at once, reason across competing priorities, and produce a concrete, justified action plan in seconds.
          </p>
        </div>
        <div className="landing-why-grid">
          {WHY_REASONING.map((w, i) => (
            <div key={i} className={`landing-why-card reveal delay-${(i % 2 + 1) * 100}`}>
              <div className="landing-why-icon">{w.icon}</div>
              <h3 className="landing-why-card-title">{w.title}</h3>
              <p className="landing-why-card-desc">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── The Yaqzan Pipeline ─── */}
      <section className="landing-pipeline reveal">
        <div className="landing-section-header">
          <span className="landing-section-tag">THE YAQZAN PIPELINE</span>
          <h2 className="landing-section-title">Five steps. Ninety seconds. Full accountability.</h2>
          <p className="landing-section-sub">
            An end-to-end architecture built for high-stakes environments. A reasoning model processes live telemetry to issue strategic directives, a deterministic verifier filters out impossible actions, and human commanders retain ultimate veto power over every execution.
          </p>
        </div>
        <div className="landing-pipeline-grid">
          {PIPELINE.map((p, i) => (
            <div
              key={i}
              className={`landing-pipeline-card ${i === step ? "landing-pipeline-card--active" : ""}`}
              onMouseEnter={() => setStep(i)}
            >
              <div className="landing-pipeline-num">{p.num}</div>
              <div className="landing-pipeline-icon">{p.icon}</div>
              <div className="landing-pipeline-title">{p.title}</div>
              <div className="landing-pipeline-subtitle">{p.sub}</div>
              <div className="landing-pipeline-desc">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Built for real response ─── */}
      <section className="landing-features reveal">
        <div className="landing-section-header">
          <span className="landing-section-tag">CAPABILITIES</span>
          <h2 className="landing-section-title">Built for real disaster response.</h2>
        </div>
        <div className="landing-features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className={`landing-feature-card reveal delay-${(i % 3 + 1) * 100}`}>
              <div className="landing-feature-icon">{f.icon}</div>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="landing-bottom reveal">
        <h2 className="landing-bottom-title">Ready to command?</h2>
        <p className="landing-bottom-sub">
          Experience K2 Think V2 reasoning through a full-scale disaster response across Kuttanad's flooded backwaters. Every directive explained. Every decision yours to approve.
        </p>
        <button onClick={onEnter} className="landing-cta-primary landing-cta-large">
          Enter the War Room
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
        <div className="landing-bottom-credits">Powered by K2 Think V2 · MBZUAI</div>
      </section>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════
   GUIDE PAGE
   ═══════════════════════════════════════════════════════════════════ */

const GUIDE = [
  { n: "1", t: "Choose a Scenario", d: "Select from three disaster scenarios: Coastal Cyclonic Flood, Earthquake and Tsunami, or Industrial Chemical Fire. Each has unique crisis dynamics.", tip: "Use the scenario selector in the header to switch mid-session." },
  { n: "2", t: "Watch K2 Reason", d: "The Commander tab shows K2's real-time reasoning: observations, hypotheses, and decisions as streaming tokens.", tip: "The reasoning stream shows the AI's actual thought process, not a summary." },
  { n: "3", t: "Review AI Directives", d: "The Plan Panel shows K2's proposed actions: evacuate district X, deploy bus_3 to shelter Y. Each verified against simulation state.", tip: "Red badges mean the verifier caught an impossible action." },
  { n: "4", t: "Accept or Override", d: "In Supervised mode, approve each directive. In Delegated mode, verified directives auto-execute but you can veto with a click.", tip: "Toggle Supervised/Delegated in the header." },
  { n: "5", t: "Report Incidents", d: "Use the Report tab to submit citizen incident reports. AI triages them, assigns severity, and escalates to the command cycle automatically.", tip: "Reports are injected into the simulation and visible on the map." },
  { n: "6", t: "Ask the Commander", d: "Chat tab: ask Yaqzan anything. Should we prioritise Vandanam or Thiruvalla? Get structured intelligence citing districts and unit IDs.", tip: "Yaqzan has full context: flood data, unit positions, hospital capacity." },
  { n: "7", t: "Explore Dashboards", d: "Ten dashboards: Overview, Commander, Roads, Medical, Comms, Resources, Districts, Chat, Reports, Simulator. Each with domain-specific analytics.", tip: "Click any district on the map for its detailed view." },
];

export const GuidePage = memo(function GuidePage({
  onBack, onEnter,
}: {
  onBack: () => void; onEnter: () => void;
}) {
  return (
    <div className="guide">
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <button onClick={onBack} className="guide-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>
        </div>
        <div className="landing-nav-links">
          <button onClick={onEnter} className="landing-cta-primary" style={{ padding: "6px 16px", fontSize: "11px" }}>
            Enter War Room
          </button>
        </div>
      </nav>
      <div className="guide-content">
        <div className="landing-section-header" style={{ marginBottom: 40 }}>
          <span className="landing-section-tag">USER GUIDE</span>
          <h2 className="landing-section-title">How to use Yaqzan</h2>
          <p className="landing-section-sub">A step-by-step walkthrough of the AI incident command system.</p>
        </div>
        <div className="guide-steps">
          {GUIDE.map((s) => (
            <div key={s.n} className="guide-step">
              <div className="guide-step-num">{s.n}</div>
              <div className="guide-step-body">
                <h3 className="guide-step-title">{s.t}</h3>
                <p className="guide-step-desc">{s.d}</p>
                <div className="guide-step-tip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>{s.tip}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="guide-bottom">
          <button onClick={onEnter} className="landing-cta-primary landing-cta-large">Start Commanding</button>
        </div>
      </div>
    </div>
  );
});
