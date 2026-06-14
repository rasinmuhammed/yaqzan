"""Application settings.

All runtime configuration comes from the environment (.env). K2 credentials
are intentionally optional: when absent, Yaqzan runs with the scripted
offline commander so the full demo works without network access.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # K2 Think V2 — values come from the API approval email. Do not guess.
    k2_base_url: str = ""
    k2_api_key: str = ""
    k2_model: str = ""
    # Generous read timeout: the endpoint holds response headers while the
    # model reasons over large prompts (measured >60s to first byte).
    k2_timeout_s: float = 300.0
    k2_max_retries: int = 3

    # Simulation
    scenario: str = "kuttanad_monsoon.json"
    tick_seconds: float = 2.0
    commander_cycle_ticks: int = 3
    seed: int = 2018
    # Hold sim time while the commander is mid-cycle. Honest pairing of
    # accelerated sim time with a slow reasoning endpoint: the disaster
    # does not outrun its commander. Recommended ON for live-K2 demos.
    commander_sync: bool = False

    # Trace persistence
    trace_dir: str = "traces"

    @property
    def k2_configured(self) -> bool:
        return bool(self.k2_base_url and self.k2_api_key and self.k2_model)


@lru_cache
def get_settings() -> Settings:
    return Settings()
