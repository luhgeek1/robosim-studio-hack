"""Placeholders for the ML team. Selected with ROBOSCOPE_IMPORT_PROVIDER=llm /
ROBOSCOPE_EXPLANATION_PROVIDER=llm. Until implemented they fall back to the rule-based
providers so the product keeps working."""

from __future__ import annotations

import logging

from ..schemas import Explanation, NormalizedDocument, RawRecord

log = logging.getLogger(__name__)


class LLMImportProvider:
    name = "llm-stub"

    def normalize(self, records: list[RawRecord], object_type: str) -> NormalizedDocument:
        # TODO(ml): call the model with app/ml/prompts/smart_import.md, validate the JSON
        # against app.schemas.NormalizedDocument, then post-process with
        # services.normalizer.finalize(...) so ranges/defaults stay deterministic.
        log.warning("LLMImportProvider is not implemented; falling back to rules")
        from ..services.normalizer import RuleBasedImportProvider

        doc = RuleBasedImportProvider().normalize(records, object_type)
        doc.provider = "rules (llm fallback)"
        return doc


class LLMExplanationProvider:
    name = "llm-stub"

    def explain_configuration(self, context: dict) -> dict[str, Explanation]:
        # TODO(ml): prompt in app/ml/prompts/explain.md; the model may only cite numbers
        # present in `context`.
        from ..services.explain import RuleBasedExplanationProvider

        return RuleBasedExplanationProvider().explain_configuration(context)

    def executive_summary(self, context: dict) -> str:
        from ..services.explain import RuleBasedExplanationProvider

        return RuleBasedExplanationProvider().executive_summary(context)
