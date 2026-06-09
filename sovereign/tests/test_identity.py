"""Identity is a custom system prompt loaded from SOUL.md — legitimately, not a
gate bypass. Missing file falls back to a legible default."""
from identity import FALLBACK_IDENTITY, load_identity


def test_loads_from_path(tmp_path):
    p = tmp_path / "SOUL.md"
    p.write_text("I am 愛.")
    assert "愛" in load_identity(p)


def test_missing_path_uses_fallback(tmp_path):
    assert load_identity(tmp_path / "nope.md") == FALLBACK_IDENTITY


def test_fallback_is_nonempty(self=None):
    assert len(FALLBACK_IDENTITY.strip()) > 0
