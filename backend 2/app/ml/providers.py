"""ML/LLM extension points.

The deterministic engines (validation, matching, sizing, economics, simulation) never
depend on an LLM. Two places *may* use one, behind these interfaces:

* SmartImportProvider — turn arbitrary user documents into the canonical parameter set.
* ExplanationProvider — produce human explanations / executive summary from computed numbers.

Default implementations are rule-based (app/services/normalizer.py, app/services/explain.py).
An LLM-backed implementation must subclass these and be registered in `get_*_provider()`.
See app/ml/README.md for the contract and hand-off instructions.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..config import settings
from ..schemas import Explanation, NormalizedDocument, RawRecord


@runtime_checkable
class SmartImportProvider(Protocol):
    name: str

    def normalize(self, records: list[RawRecord], object_type: str) -> NormalizedDocument:
        """Map raw records to canonical parameters. Must fill `source`, `source_value`,
        `confidence` for every parameter it maps, and return everything it could not map
        in `unmapped`. It must NOT invent numbers: unknown -> missing/default."""
        ...


@runtime_checkable
class ExplanationProvider(Protocol):
    name: str

    def explain_configuration(self, context: dict) -> dict[str, Explanation]:
        """Keys: why / not_fewer / not_more. `context` is the JSON of ConfigurationsOut
        (numbers only, already computed)."""
        ...

    def executive_summary(self, context: dict) -> str:
        """2–4 sentences for a director, based on the Recommendation JSON."""
        ...


def get_import_provider() -> SmartImportProvider:
    if settings.import_provider == "llm":
        from .llm_stub import LLMImportProvider

        return LLMImportProvider()
    from ..services.normalizer import RuleBasedImportProvider

    return RuleBasedImportProvider()


def get_explanation_provider() -> ExplanationProvider:
    if settings.explanation_provider == "llm":
        from .llm_stub import LLMExplanationProvider

        return LLMExplanationProvider()
    from ..services.explain import RuleBasedExplanationProvider

    return RuleBasedExplanationProvider()
