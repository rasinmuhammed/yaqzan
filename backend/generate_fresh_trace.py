import asyncio
import os
from app.main import Session
from app.commander.k2_client import K2Client
from app.commander.loop import CommanderLoop

async def main():
    sess = Session()
    sess.client = K2Client(sess.settings)
    sess.commander_name = "k2"
    # Overwrite loop with new client
    sess.loop = CommanderLoop(
        sess.engine, sess.client, sess.trace, sess.hub.broadcast,
        cycle_ticks=sess.settings.commander_cycle_ticks,
    )
    
    print("Starting fresh trace capture...")
    while sess.engine.tick < sess.engine.max_ticks:
        snap = sess.engine.step()
        if sess.loop.cycle_due(snap):
            print(f"Running cycle for tick {snap.tick}...")
            await sess.loop.run_cycle(snap)
    
    print(f"Trace captured successfully!")
    print(f"File saved to: {sess.trace._file.name if sess.trace._file else 'Unknown'}")

    import shutil
    from app.sim.engine import SCENARIO_DIR
    target = SCENARIO_DIR / "demo_trace.jsonl"
    shutil.copy(sess.trace._file.name, target)
    print(f"Copied to {target}")

if __name__ == "__main__":
    asyncio.run(main())
