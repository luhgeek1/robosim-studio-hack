from app.engine.trace import Book

MM_PER_M = 1000.0


def required_passage_m(specs: Book, norms: Book, cargo_width_mm: float = 0.0) -> float:
    """Conservative straight-passage envelope, shared by matching and simulation routing."""
    width = specs.optional("width_mm")
    aisle = specs.optional("min_aisle_width_mm")
    clearance = norms.optional("aisle_safety_clearance_mm")
    envelope = max(width.value if width else 0.0, cargo_width_mm)
    return (
        max(
            aisle.value if aisle else 0.0,
            envelope + (clearance.value if clearance else 0.0) if envelope else 0.0,
        )
        / MM_PER_M
    )
