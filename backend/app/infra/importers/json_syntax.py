import json
from collections.abc import Callable
from typing import Any


def _without_trailing_commas(text: str) -> tuple[str, int]:
    output: list[str] = []
    quoted = escaped = False
    removed = 0
    for index, char in enumerate(text):
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char == "," and _followed_by_closing(text, index + 1):
            removed += 1
            continue
        output.append(char)
    return "".join(output), removed


def read_json(text: str, fields: Callable[[list[tuple[str, Any]]], dict[str, Any]]) -> tuple[Any, list[str]]:
    try:
        return json.loads(text, object_pairs_hook=fields), []
    except json.JSONDecodeError:
        repaired, count = _without_trailing_commas(text)
        if not count:
            raise
        # Only punctuation outside strings changes; a successful second parse proves the repair is sufficient.
        data = json.loads(repaired, object_pairs_hook=fields)
        return data, [
            f"Формат JSON восстановлен: удалены лишние запятые перед закрывающими скобками ({count}). "
            "Проверьте значения; исправленный JSON можно скачать перед применением"
        ]


def _followed_by_closing(text: str, index: int) -> bool:
    while index < len(text) and text[index].isspace():
        index += 1
    return index < len(text) and text[index] in "}]"
