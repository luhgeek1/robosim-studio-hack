from app.engine.matching import CandidateStatus
from app.service.matching.candidates import CandidateData
from app.service.matching.service import ProcessMatchingView


def sizing_issue(data: CandidateData) -> str | None:
    if data.input.robots_estimate is not None:
        return None
    if data.sizing_model is None:
        return "Для этого типа решения нет модели автоматического расчёта количества."
    if data.sizing is None:
        return "Не хватает параметров объекта для расчёта нагрузки."
    names = [
        data.input.spec_names.get(key.removeprefix("spec:"), "данные для расчёта цикла")
        for key in data.sizing.missing
    ]
    return "Не хватает данных: " + ", ".join(dict.fromkeys(names)) + "."


def omission_reason(process: ProcessMatchingView) -> str:
    eligible = [
        c for c in process.candidates if c.result.status in {CandidateStatus.FIT, CandidateStatus.CHECK}
    ]
    if not eligible:
        return process.no_fit_message or "В автоматическом подборе нет подходящих кандидатов."
    estimated = [c for c in eligible if c.economics is not None]
    missing = len(eligible) - len(estimated)
    parts = []
    if estimated:
        parts.append(
            "У рассчитанных кандидатов NPV покупки не положительный: "
            "денежный эффект с учётом срока и ставки не покрывает вложения."
        )
    if missing:
        parts.append(
            f"Без полной оценки экономики: {missing}. Проверьте данные кандидата "
            "и задайте количество или производительность в своём сценарии."
        )
    return " ".join(parts)
