# Yaqzan — Demo Storyboard (≈ 2 minutes)

The spine: **official data goes dark → the public becomes the sensor network →
K2 triages every report and guides people → humans run the rescues → the system
adapts to a live curveball → an honest after-action measure.**

Golden rules for the recording:
- **Never show K2 latency as dead air.** Pre-warm a run; lead with the fast
  citizen-report beat; when a commander cycle is "thinking," the Deliberation
  HUD (elapsed seconds + phase) is on screen — that's b-roll, not a stall.
- **Every number on screen is real or labelled a drill measure.** Never say
  "saved lives." Say "triaged," "guided," "caught by the verifier," "lower
  modelled exposure in the drill."
- Record at `~1.5s/tick`. Have one full run already at tick ~25 before you hit
  record so the map is alive and the exposure gap is visibly widening.

---

## Shot 0 — Cold open (0:00–0:12)
**On screen:** Landing page. Slow push on the hero.
**VO:** "When a flood hits, the official picture goes dark — sensors fail, the
control room is blind for hours. In Kerala in 2018, people coordinated rescues
over WhatsApp because nothing else worked."
**Action:** Click **Enter the War Room**.

## Shot 1 — This is a real place (0:12–0:25)
**On screen:** The map. Pan once across Kuttanad — real town labels (Alappuzha,
Champakulam, Chengannur), the Vembanad backwaters, the flood heatmap pooling in
the below-sea-level polders, boats and ferries on real roads.
**VO:** "This is the real Kuttanad — every district, road and elevation from
OpenStreetMap and NASA. The flood follows the actual terrain. This is a training
drill, modelled on 2018, so we can prove the system before it ever touches a
real city."

## Shot 2 — A citizen reports (0:25–0:48) — THE HEART
**On screen:** Reports tab. Click **Report Incident**. Type a real-sounding plea:
*"Family of six stranded on a rooftop in Champakulam, water rising, an elderly
man needs his medicine."* Submit.
**VO:** "Anyone can report. Watch what K2 does with it."
**Action:** The reasoning streams (this is fast — one short call). Then:
1. A green **"Instruction sent to reporter"** card appears first — *"Move to the
   highest floor now, don't enter the water, signal from the roof…"*
2. Below it, the **triage** for responders and a **verified rescue op** —
   `evacuate Champakulam → Cherthala using boat_5`.
**VO:** "In seconds the person gets a safe instruction, and responders get a
prioritised, verified rescue — the boat that's actually nearest, on a route that
actually exists."

## Shot 3 — The human is in command (0:48–1:05)
**On screen:** Hover the verified op; click **Approve & Dispatch**. Cut to the
map: the boat marker starts moving **along the real road/ferry geometry**.
**VO:** "Nothing happens until a responder approves it. The AI advises; the human
commands."
**(Guaranteed trust beat):** Switch to the **Commander** tab. Have a cycle queued
where the verifier rejected something — point at the red **"caught by verifier"**
directive (e.g. a shelter that's taking water).
**VO:** "And when the model gets it wrong — here, it tried to send people to a
shelter that's already flooding — the grounded verifier catches it before any
human sees it. Catching the model is the point."

## Shot 4 — Break the world (1:05–1:30) — THE WOW
**On screen:** Click **Inject Event**. Type: *"A bund just collapsed at Pandanad
and the power's out across Kavalam."* Inject.
**VO:** "Real incidents don't follow a script. So neither does this."
**Action:** K2 interprets the plain-language event into real effects
(water surge at Pandanad, power out in Kavalam) — the map updates, the inject
banner fires, 911 volume jumps. The Deliberation HUD shows the commander
re-planning.
**VO:** "K2 reads the event, changes the world, and the commander re-plans
against it — live."

## Shot 5 — The honest payoff (1:30–1:55)
**On screen:** Overview tab — the dual curve. The **AI-coordinated vs no-response**
gap is visibly widening across the run.
**VO:** "Across the drill, the AI-coordinated response keeps the modelled
population exposure well below a no-response run — and the gap is *earned* over
time, as warnings take effect and boats reach people."
**Action:** Let the run hit tick 60 → the **After-Action Report** auto-appears.
**VO:** "Every figure here is a real count — reports triaged, people guided,
unsafe directives the verifier caught — and the one simulation measure is
labelled exactly as that."

## Shot 6 — Close (1:55–2:05)
**On screen:** Hold on the After-Action Report, then the "Powered by K2 Think V2"
footer.
**VO:** "Yaqzan turns the public into the sensor network and K2 Think V2 into the
triage brain — and keeps a human on every life-or-death call. When the official
picture goes dark, this is how a city sees again."

---

## Pre-flight checklist (do before recording)
- [ ] Backend up, `commander=k2`, `COMMANDER_SYNC=true`, scenario `kuttanad_monsoon`.
- [ ] Do one full live-K2 dress run; confirm: a positive widening exposure gap,
      at least one **verifier-catch**, one **boat moving on a road** (trigger via
      a citizen report + approve if K2 front-loads alerts).
- [ ] Pre-warm: start a run and let it reach ~tick 25 before recording Shot 1.
- [ ] Have the Champakulam citizen report and the Pandanad live event typed and
      ready to paste.
- [ ] Zoom the map to frame Kuttanad's polders (where the heatmap is richest).
- [ ] Confirm zero console errors (`preview_console_logs`).

## Lines to NEVER say
- "Saved N lives." → "Kept modelled exposure N% lower in the drill."
- "It replaces responders." → "It's decision support; humans run the rescues."
- "It's deployed." → "It's a drill that stress-tests the system before deployment."
