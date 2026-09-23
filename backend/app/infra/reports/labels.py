KIND_LABELS = {
    "param": "параметр объекта",
    "norm": "норматив",
    "spec": "ТТХ продукта",
    "layout": "планировка",
    "simulation": "имитация",
    "metric": "расчёт",
}
STATUS_LABELS = {
    "user": "введено",
    "imported": "из файла",
    "llm_suggested": "предложено ассистентом",
    "default": "по умолчанию",
    "assumption": "допущение",
    "derived": "вычислено",
    "confirmed": "подтверждено",
    "vendor_claim": "заявка вендора",
    "missing": "нет данных",
}
_SCENARIO_KINDS = {"baseline": "Как сейчас", "purchase": "Покупка", "raas": "RaaS", "lease": "Лизинг"}
_VERDICTS = {
    "attractive": "Привлекательно (до 3 лет)",
    "reasonable": "Обоснованно (3–5 лет)",
    "questionable": "Сомнительно",
    "not_recommended": "Нецелесообразно",
    "insufficient_data": "Недостаточно данных",
    "baseline": "База для сравнения",
}
CANDIDATE_STATUS = {
    "fit": "подходит",
    "check": "требует проверки",
    "excluded": "не подходит",
    "manual": "вручную",
}


def scenario_kind(kind: str) -> str:
    return _SCENARIO_KINDS.get(kind, kind)


def verdict_label(verdict: str) -> str:
    return _VERDICTS.get(verdict, verdict)
