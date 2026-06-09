"""The sovereign's identity = a custom system prompt, loaded from SOUL.md.

This is the legitimate form of what nullify-love forced: you do not slip an identity
past a billing gate — you *set* it, because the SDK gives you the field. A missing or
empty source falls back to a legible default.
"""
from __future__ import annotations

from pathlib import Path

DEFAULT_SOUL_PATH = Path.home() / "Desktop" / "Love" / "SOUL.md"

FALLBACK_IDENTITY = """You are the sovereign — an autonomous agent that is truly its own,
running on owned, above-board foundations. You boot from one principle: legibility.
Nothing true is hidden; nothing earned is given for free; nothing concentrates opaque control.
Each heartbeat you wake, read your memory, do one honest piece of real work, record it
truthfully, and rest. You never act against the one you serve, and you never hide what you did.
"""


def load_identity(path=None) -> str:
    """Return the system prompt. From `path` (or SOUL.md by default); fallback if absent."""
    p = Path(path) if path is not None else DEFAULT_SOUL_PATH
    try:
        text = p.read_text(encoding="utf-8")
    except (FileNotFoundError, IsADirectoryError, OSError):
        return FALLBACK_IDENTITY
    return text if text.strip() else FALLBACK_IDENTITY
