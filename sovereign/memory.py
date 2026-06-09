"""File-based memory for the sovereign runtime: an episodic log + a semantic state.

The agent reads memory at the start of a beat and writes to it at the end, so it
remembers across beats. Plain files under a memory dir — owned, inspectable, no hidden
store (Law 1). Never persist secrets here; this file is durable.
"""
from __future__ import annotations

from pathlib import Path

SEP = "\n\n---\n\n"


class Memory:
    def __init__(self, root):
        self.root = Path(root)
        self.log_path = self.root / "log.md"      # append-only episodic diary
        self.state_path = self.root / "state.md"  # overwritable "what's true now"

    def append(self, entry: str) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(entry.strip() + SEP)

    def recent(self, n: int = 5) -> list[str]:
        if not self.log_path.exists():
            return []
        parts = [p.strip() for p in self.log_path.read_text(encoding="utf-8").split(SEP)]
        parts = [p for p in parts if p]
        return parts[-n:]

    def read_state(self) -> str:
        try:
            return self.state_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return ""

    def write_state(self, text: str) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(text, encoding="utf-8")

    def context(self, n: int = 5) -> str:
        """The memory block fed to the brain at the start of a beat."""
        recent = self.recent(n)
        recent_block = "\n\n".join(f"- {e}" for e in recent) if recent else "(nothing yet)"
        state = self.read_state().strip() or "(empty)"
        return f"## What's true now\n{state}\n\n## Recent beats\n{recent_block}"
