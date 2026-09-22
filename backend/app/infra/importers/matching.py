import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.domain.reference import ParameterDef

EXACT_CONFIDENCE = 1.0
# Min ratio for an automatic fuzzy match: tolerates 1–2 typos in a typical 20–40 character name,
# while unrelated names in the organizer dataset stay well below it.
FUZZY_MATCH_THRESHOLD = 0.85
# Closest distinct parameters in the dataset differ by one letter («отходов класса А/Б»): when the runner-up
# is this close, the match is ambiguous and goes to the user as a suggestion instead.
FUZZY_AMBIGUITY_MARGIN = 0.05
SUGGESTION_THRESHOLD = 0.6

_NON_WORD = re.compile(r"[^\w]+")


def normalize(text: str) -> str:
    return " ".join(_NON_WORD.sub(" ", text.lower().replace("ё", "е")).split())


@dataclass(frozen=True, slots=True)
class Match:
    param: ParameterDef
    confidence: float


@dataclass(frozen=True, slots=True)
class Resolution:
    match: Match | None
    suggestion_key: str | None = None


class ParameterMatcher:
    def __init__(self, parameters: list[ParameterDef]) -> None:
        self._by_key = {param.key: param for param in parameters}
        self._by_dataset_row = {
            param.dataset_row.strip(): param for param in reversed(parameters) if param.dataset_row
        }
        self._texts: list[tuple[ParameterDef, str]] = [
            (param, normalize(text))
            for param in parameters
            for text in dict.fromkeys([param.name, param.dataset_row or ""])
            if text
        ]
        self._by_normalized: dict[str, ParameterDef] = {}
        for param, text in self._texts:
            self._by_normalized.setdefault(text, param)

    def by_key(self, key: str) -> ParameterDef | None:
        return self._by_key.get(key.strip())

    def resolve(self, text: str) -> Resolution:
        stripped = text.strip()
        exact = (
            self._by_dataset_row.get(stripped)
            or self._by_key.get(stripped)
            or self._by_normalized.get(normalize(stripped))
        )
        if exact is not None:
            return Resolution(Match(exact, EXACT_CONFIDENCE))
        return self._fuzzy(normalize(stripped))

    def _fuzzy(self, text: str) -> Resolution:
        if not text:
            return Resolution(None)
        best: dict[str, tuple[float, ParameterDef]] = {}
        for param, candidate in self._texts:
            ratio = SequenceMatcher(None, text, candidate).ratio()
            if ratio > best.get(param.key, (0.0, param))[0]:
                best[param.key] = (ratio, param)
        ranked = sorted(best.values(), key=lambda item: item[0], reverse=True)
        if not ranked or ranked[0][0] < SUGGESTION_THRESHOLD:
            return Resolution(None)
        ratio, param = ranked[0]
        runner_up = ranked[1][0] if len(ranked) > 1 else 0.0
        if ratio >= FUZZY_MATCH_THRESHOLD and ratio - runner_up >= FUZZY_AMBIGUITY_MARGIN:
            return Resolution(Match(param, round(ratio, 3)))
        return Resolution(None, suggestion_key=param.key)
