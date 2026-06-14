import json

with open("backend/app/sim/scenarios/demo_trace.jsonl", "r") as f:
    lines = f.readlines()

with open("backend/app/sim/scenarios/demo_trace.jsonl", "w") as f:
    for line in lines:
        if not line.strip():
            continue
        try:
            d = json.loads(line)
            if d.get("type") == "cycle" and "reasoning" in d:
                r = d["reasoning"]
                if "</think>" in r:
                    r = r.split("</think>")[-1].strip()
                if len(r) > 2000:
                    r = r[:2000] + "..."
                d["reasoning"] = r
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
        except:
            f.write(line)
