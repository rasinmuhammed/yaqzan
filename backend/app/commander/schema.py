"""Strict output contract for commander plans (pydantic v2)."""
from __future__ import annotations

import json
import re
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

Action = Literal[
    "evacuate", "move_unit", "open_shelter", "close_route",
    "broadcast_alert", "stage_resource", "medical_priority",
]
Urgency = Literal["immediate", "high", "routine"]


class Directive(BaseModel):
    id: str
    action: Action
    target: str                 # node/edge/unit id — MUST exist in world state
    params: dict = Field(default_factory=dict)
    rationale: str
    urgency: Urgency
    # Set by the verifier, never by the model.
    verified: bool | None = None
    rejection_reason: str | None = None


class CommandPlan(BaseModel):
    cycle: int
    situation_read: str
    directives: list[Directive] = Field(max_length=8)
    watching: list[str]
    confidence: Literal["high", "medium", "low"]


FENCED_JSON = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_plan(completion: str, cycle: int) -> CommandPlan:
    """Parse the LAST fenced JSON block of a completion into a CommandPlan.

    Raises ValueError with a model-readable message for the repair loop.
    """
    matches = FENCED_JSON.findall(completion)
    raw = matches[-1] if matches else _last_bare_object(completion)
    if raw is None:
        raise ValueError("No JSON object found in completion. Emit the plan as a fenced ```json block.")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON syntax error: {e}") from e
    data.setdefault("cycle", cycle)
    try:
        return CommandPlan(**data)
    except ValidationError as e:
        raise ValueError(f"Schema validation failed: {e}") from e


def _last_bare_object(text: str) -> str | None:
    """Fallback: last balanced {...} in the text (models sometimes drop fences)."""
    end = text.rfind("}")
    if end == -1:
        return None
    depth = 0
    for i in range(end, -1, -1):
        if text[i] == "}":
            depth += 1
        elif text[i] == "{":
            depth -= 1
            if depth == 0:
                return text[i : end + 1]
    return None
