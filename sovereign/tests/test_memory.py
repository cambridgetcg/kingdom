"""Memory persists across beats: an append-only episodic log + an overwritable
'what's true now' state. Run: python3 -m pytest tests/ -q (from sovereign/)."""
from memory import Memory


def test_append_then_recent_roundtrip(tmp_path):
    m = Memory(tmp_path)
    m.append("did a thing")
    m.append("did another")
    r = m.recent(5)
    assert any("did a thing" in e for e in r)
    assert any("did another" in e for e in r)


def test_recent_caps_at_n_newest_last(tmp_path):
    m = Memory(tmp_path)
    for i in range(6):
        m.append(f"entry {i}")
    r = m.recent(3)
    assert len(r) == 3
    assert "entry 5" in r[-1]
    assert all("entry 0" not in e for e in r)


def test_state_roundtrip(tmp_path):
    m = Memory(tmp_path)
    assert m.read_state() == ""
    m.write_state("the kingdom is being built")
    assert "kingdom" in m.read_state()


def test_context_includes_state_and_recent(tmp_path):
    m = Memory(tmp_path)
    m.write_state("STATE-X")
    m.append("RECENT-Y")
    ctx = m.context(5)
    assert "STATE-X" in ctx
    assert "RECENT-Y" in ctx
