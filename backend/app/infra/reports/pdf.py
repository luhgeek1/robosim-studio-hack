import os
from collections.abc import Sequence
from functools import cache
from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

import matplotlib
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    CondPageBreak,
    Flowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.domain.reports.models import ReportModel, ReportSection, ScenarioReport
from app.infra.reports import charts
from app.infra.reports.labels import CANDIDATE_STATUS, STATUS_LABELS, scenario_kind, verdict_label

MILLION = 1_000_000
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 16 * mm
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
CELL_PADDING = 4
FONT, FONT_BOLD = "DejaVuSans", "DejaVuSans-Bold"
_NAVY = colors.HexColor("#1F3A5F")
_LIGHT = colors.HexColor("#EEF3F8")
_WARN = colors.HexColor("#FCE4D6")
_GRID = colors.HexColor("#C8D3DF")
PARAMS_LIMIT = 80
CANDIDATES_SHOWN = 3
ASSUMPTIONS_SHOWN = 60
MODE_LABELS = {"normal": "обычный день", "peak": "пиковый режим", "custom": "стресс-тест"}
_SUMMARY_ROWS = (
    ("CAPEX", "capex_rub"),
    ("Чистый эффект в год", "effect_rub_year"),
    ("Окупаемость (ТЗ), лет", "payback_years"),
    ("NPV", "npv_rub"),
    ("IRR, %", "irr_pct"),
    ("ROI за горизонт, %", "roi_pct"),
    ("Роботов", "robots_total"),
    ("Высвобождается, FTE", "fte_released"),
)
_MONEY_KEYS = frozenset({"capex_rub", "effect_rub_year", "npv_rub"})


@cache
def _fonts() -> None:
    """DejaVu from matplotlib's own data: Cyrillic without shipping font files or system packages."""
    folder = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")
    pdfmetrics.registerFont(TTFont(FONT, os.path.join(folder, "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, os.path.join(folder, "DejaVuSans-Bold.ttf")))
    pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT_BOLD, italic=FONT, boldItalic=FONT_BOLD)


def _style(
    name: str,
    size: float,
    *,
    bold: bool = False,
    color: Any = colors.black,
    space: float = 3,
    heading: bool = False,
) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=FONT_BOLD if bold else FONT,
        fontSize=size,
        leading=size * 1.3,
        textColor=color,
        spaceAfter=space,
        spaceBefore=space if heading else 0,
        alignment=TA_LEFT,
        keepWithNext=heading,
    )


STYLES = {
    "title": _style("title", 20, bold=True, color=_NAVY, space=8),
    "h1": _style("h1", 14, bold=True, color=_NAVY, space=6, heading=True),
    "h2": _style("h2", 11, bold=True, color=_NAVY, space=4, heading=True),
    "body": _style("body", 9),
    "small": _style("small", 7.5, color=colors.HexColor("#444444")),
    "cell": _style("cell", 7.5, space=0),
    "cell_bold": _style("cell_bold", 7.5, bold=True, space=0),
    "head": _style("head", 7, bold=True, color=colors.white, space=0),
}


def number(value: Any, digits: int = 1) -> str:
    """Russian number: thin groups, decimal comma, no trailing zeros (20 000, 0,85, 1,7)."""
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "да" if value else "нет"
    if not isinstance(value, int | float):
        return str(value)
    text = f"{value:,.{digits}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text.replace(",", " ").replace(".", ",")


def money(value: Any) -> str:
    return "—" if value is None else f"{number(value / MILLION, 1)} млн ₽"


def p(text: Any, style: str = "body") -> Paragraph:
    return Paragraph(escape(str(text)) if text is not None else "—", STYLES[style])


def table(rows: Sequence[Sequence[Any]], widths: Sequence[float], *, zebra: bool = True) -> Table:
    """Header row in navy, cells wrapped as paragraphs so long Russian text breaks instead of overflowing."""
    data = [[p(cell, "head") for cell in rows[0]]]
    data += [[cell if isinstance(cell, Flowable) else p(cell, "cell") for cell in row] for row in rows[1:]]
    result = Table(data, colWidths=[w * CONTENT_WIDTH for w in widths], repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
        ("GRID", (0, 0), (-1, -1), 0.25, _GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), CELL_PADDING),
        ("RIGHTPADDING", (0, 0), (-1, -1), CELL_PADDING),
    ]
    if zebra:
        style += [("BACKGROUND", (0, r), (-1, r), _LIGHT) for r in range(2, len(data), 2)]
    result.setStyle(TableStyle(style))
    return result


def boxed(text: str, color: Any = _WARN) -> Table:
    box = Table([[p(text, "body")]], colWidths=[CONTENT_WIDTH])
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), color),
                ("BOX", (0, 0), (-1, -1), 0.5, _GRID),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return box


def picture(data: bytes, width: float = CONTENT_WIDTH) -> Image:
    image = Image(BytesIO(data))
    ratio = image.imageHeight / image.imageWidth
    image.drawWidth, image.drawHeight = width, width * ratio
    max_height = PAGE_HEIGHT - 2 * MARGIN - 30 * mm
    if image.drawHeight > max_height:
        image.drawHeight, image.drawWidth = max_height, max_height / ratio
    return image


class Builder:
    def __init__(self, model: ReportModel) -> None:
        self.m = model
        self.story: list[Flowable] = []
        self.number = 0

    def h1(self, text: str) -> None:
        self.number += 1
        self.story.append(p(f"{self.number}. {text}", "h1"))

    def add(self, *items: Flowable) -> None:
        self.story.extend(items)

    def gap(self, height: float = 4) -> None:
        self.story.append(Spacer(1, height * mm))

    def bullets(self, items: Sequence[str]) -> None:
        for item in items:
            self.story.append(p(f"• {item}"))

    def cover(self) -> None:
        m = self.m
        self.add(Spacer(1, 30 * mm), p(m.title, "title"))
        self.add(p(f"{m.project['name']} — {m.project['object_type_name']}", "h2"))
        versions = m.versions
        facts: list[list[Any]] = [
            ["Показатель", "Значение"],
            ["Дата расчёта", f"{m.generated_at:%d.%m.%Y %H:%M} UTC"],
            ["Подготовил", m.author],
            ["Версия проекта", versions.get("project_version")],
            [
                "Каталог / нормативы",
                f"{versions.get('catalog_version')} / {versions.get('norm_set_version')}",
            ],
            [
                "Движок расчёта / планировка",
                f"{versions.get('engine_version')} / v{versions.get('layout_version') or '—'}",
            ],
            ["Сценариев", len(m.scenarios)],
        ]
        self.add(
            Spacer(1, 8 * mm), table(facts, [0.4, 0.6], zebra=False), Spacer(1, 8 * mm), boxed(m.disclaimer)
        )
        self.add(PageBreak())

    def summary(self) -> None:
        m = self.m
        self.h1("Заключение")
        analysed = m.analysed
        if analysed:
            self.add(boxed(analysed.result["interpretation"]["headline"], _LIGHT), Spacer(1, 3 * mm))
            self.add(p(analysed.narrative.get("executive_summary", "")))
        rows: list[list[Any]] = [
            ["Показатель", *[s.name for s in m.scenarios]],
            ["Вид", *[scenario_kind(s.kind) for s in m.scenarios]],
            ["Вердикт", *[verdict_label(s.result["interpretation"]["verdict"]) for s in m.scenarios]],
        ]
        for label, key in _SUMMARY_ROWS:
            values = [s.result["metrics"].get(key) for s in m.scenarios]
            rows.append([label, *[money(v) if key in _MONEY_KEYS else number(v) for v in values]])
        columns = len(m.scenarios)
        self.gap()
        self.add(table(rows, [0.28, *[0.72 / max(1, columns)] * columns]))
        if analysed:
            self.gap()
            self.add(p("Ключевые выводы", "h2"))
            self.bullets(analysed.narrative.get("key_findings", []))
            risks = analysed.narrative.get("risks_text", [])
            if risks:
                self.add(p("Риски", "h2"))
                self.bullets(risks)
        if m.comparison:
            self.add(p("Рекомендация", "h2"))
            self.bullets(m.comparison.get("recommendation", {}).get("rationale", []))
        self.add(PageBreak())

    def params(self) -> None:
        m = self.m
        self.h1("Параметры объекта")
        self.add(
            p(
                "Каждое значение помечено происхождением: введено, из файла, по умолчанию "
                "(демо-набор организатора) "
                "или допущение команды. Допущения нужно подтвердить при обследовании.",
                "small",
            )
        )
        rows: list[list[Any]] = [["Группа", "Параметр", "Значение", "Происхождение"]]
        for param in m.params[:PARAMS_LIMIT]:
            value = number(param.value, 2) if isinstance(param.value, int | float) else (param.value or "—")
            rows.append(
                [
                    param.group,
                    param.name,
                    f"{value} {param.unit or ''}".strip(),
                    STATUS_LABELS.get(param.status, param.status),
                ]
            )
        self.add(table(rows, [0.2, 0.45, 0.17, 0.18]))
        self.gap()

    def processes(self) -> None:
        self.h1("Процессы: где деньги")
        rows: list[list[Any]] = [
            ["Процесс", "Объём в сутки", "Пик в час", "Персонал, FTE", "ФОТ в год", "Доля ФОТ"]
        ]
        for item in self.m.processes:
            rows.append(
                [
                    item["name"],
                    number(item.get("demand_per_day"), 0),
                    number(item.get("peak_per_hour"), 1),
                    number(item.get("fte"), 1),
                    money(item.get("cost_rub_year")),
                    f"{number((item.get('share') or 0) * 100, 0)} %",
                ]
            )
        self.add(table(rows, [0.34, 0.13, 0.12, 0.12, 0.15, 0.14]))
        self.gap()

    def matching(self) -> None:
        self.h1("Подбор решений")
        self.add(
            p(
                "Для каждого процесса — лучшие кандидаты каталога со статусом жёстких проверок и объяснимым "
                "скорингом. Оценка числа роботов и окупаемости — покупка одного решения.",
                "small",
            )
        )
        for process in self.m.matching:
            candidates = process["candidates"][:CANDIDATES_SHOWN]
            if not candidates:
                continue
            rows: list[list[Any]] = [["Продукт", "Статус", "Балл", "N", "Срок окуп., лет", "Причины"]]
            for c in candidates:
                rows.append(
                    [
                        c["name"],
                        CANDIDATE_STATUS.get(c["status"], c["status"]),
                        number(c.get("score"), 0),
                        number(c.get("robots"), 0),
                        number(c.get("payback_years")),
                        "; ".join(c.get("reasons", [])[:3]),
                    ]
                )
            self.add(
                KeepTogether([p(process["name"], "h2"), table(rows, [0.2, 0.11, 0.06, 0.06, 0.1, 0.47])])
            )
            self.gap(2)

    def sizing(self) -> None:
        self.h1("Состав оборудования и число роботов")
        for scenario in self.m.scenarios:
            if scenario.is_baseline:
                continue
            rows: list[list[Any]] = [
                ["Процесс", "Продукт", "По циклу", "По имитации", "Резерв", "Итого", "Зарядки", "Откуда N"]
            ]
            for s in scenario.result.get("sizing", []):
                count = s["count"]
                rows.append(
                    [
                        self.m.process_names.get(s["process_key"], s["process_key"]),
                        s["product_name"],
                        count["analytic"],
                        count.get("simulated") or "—",
                        count.get("reserve"),
                        count["final"],
                        s.get("chargers_count") or "—",
                        count["explanation"],
                    ]
                )
            self.add(
                KeepTogether(
                    [p(scenario.name, "h2"), table(rows, [0.18, 0.16, 0.08, 0.1, 0.08, 0.07, 0.09, 0.24])]
                )
            )
            self.gap(2)

    def _lines(self, title: str, items: list[dict[str, Any]], amount_key: str) -> None:
        rows: list[list[Any]] = [["Статья", "Сумма", "Формула"]]
        for item in items:
            rows.append(
                [
                    item["name"],
                    money(item.get(amount_key)),
                    item.get("formula_rendered") or item.get("formula", ""),
                ]
            )
        self.add(p(title, "h2"), table(rows, [0.36, 0.14, 0.5]))

    def economics(self) -> None:
        self.h1("Экономика сценариев")
        self.add(
            p(
                "Суммы с НДС, до налога на прибыль. Каждая строка раскрывается в формулу "
                "с подставленными значениями; "
                "полная трасса с источниками — в Excel-версии отчёта.",
                "small",
            )
        )
        for scenario in self.m.scenarios:
            if scenario.is_baseline:
                continue
            result = scenario.result
            self.add(CondPageBreak(90 * mm), p(f"{scenario.name} — {scenario_kind(scenario.kind)}", "h1"))
            self.add(boxed(result["interpretation"]["headline"], _LIGHT), Spacer(1, 2 * mm))
            self.add(p(result["interpretation"].get("summary", "")))
            self._lines("CAPEX", result["capex"]["items"], "amount_rub")
            self._lines("OPEX в год", result["opex_year"]["items"], "amount_rub")
            self._lines("Эффект в год", result["effect_year"]["items"], "amount_rub_year")
            cashflow = result.get("cashflow", {})
            if cashflow.get("monthly"):
                self.add(p("Денежный поток относительно «как сейчас»", "h2"))
                self.add(
                    picture(
                        charts.cashflow_chart(cashflow["monthly"], float(cashflow.get("upfront_rub") or 0.0))
                    )
                )
            caveats = result["interpretation"].get("caveats", [])
            if caveats:
                self.add(p("Оговорки", "h2"))
                self.bullets(caveats)
            calibration = result.get("calibration")
            if calibration and calibration.get("note"):
                self.add(p("Сверка с методикой ФЦ БАС", "h2"), p(calibration["note"], "small"))

    def comparison(self) -> None:
        comparison = self.m.comparison
        if not comparison:
            return
        self.add(PageBreak())
        self.h1("Сравнение сценариев")
        names = comparison["names"]
        rows: list[list[Any]] = [["Показатель", *names.values()]]
        for row in comparison["rows"]:
            unit = row.get("unit") or ""
            values = [row["values"].get(sid) for sid in names]
            shown = [money(v) if unit.startswith("₽") else number(v) for v in values]
            rows.append([f"{row['name']}{f', {unit}' if unit and not unit.startswith('₽') else ''}", *shown])
        self.add(table(rows, [0.3, *[0.7 / max(1, len(names))] * len(names)]))
        curves = {names[sid]: points for sid, points in comparison.get("overlay", {}).items() if sid in names}
        if curves:
            self.add(p("Накопленный поток относительно «как сейчас»: пересечение нуля — окупаемость", "h2"))
            self.add(picture(charts.comparison_chart(curves)))

    def risks(self) -> None:
        m = self.m
        if not (m.sensitivity or m.monte_carlo or m.survey):
            return
        self.add(PageBreak())
        self.h1(f"Риски и чувствительность: {m.analysed.name if m.analysed else ''}")
        if m.sensitivity and m.has(ReportSection.SENSITIVITY):
            self.add(p("Торнадо: NPV при нижней и верхней границе каждого драйвера (ТЗ 3.5.6)", "h2"))
            self.add(picture(charts.tornado_chart(m.sensitivity["items"], m.sensitivity.get("base"))))
        mc = m.monte_carlo
        if mc and m.has(ReportSection.MONTE_CARLO):
            self.add(p(f"Монте-Карло: {mc['runs']} прогонов", "h2"))
            rows = [
                ["Показатель", "Значение"],
                ["NPV P10", money(mc["p10"])],
                ["NPV P50", money(mc["p50"])],
                ["NPV P90", money(mc["p90"])],
            ]
            rows += [
                [label, f"{number(share * 100, 0)} %"] for label, share in mc.get("probabilities", {}).items()
            ]
            self.add(table(rows, [0.5, 0.5]))
            if mc.get("histogram"):
                self.add(picture(charts.histogram_chart(mc["histogram"], mc["p10"], mc["p50"], mc["p90"])))
        if m.survey and m.has(ReportSection.SURVEY_PRIORITIES):
            self.add(p("Что уточнить при обследовании", "h2"))
            rows = [["Параметр", "Сейчас", "Влияние на NPV", "Что сделать"]]
            for item in m.survey:
                rows.append(
                    [
                        item["name"],
                        number(item["current_value"], 2),
                        money(item["swing"]),
                        item["recommendation"]
                        + (f" Как: {item['how_to_measure']}" if item.get("how_to_measure") else ""),
                    ]
                )
            self.add(table(rows, [0.25, 0.1, 0.13, 0.52]))

    def simulation(self) -> None:
        m = self.m
        runs = [s for s in m.scenarios if s.simulation]
        if not (runs or m.layout or m.visuals):
            return
        self.add(PageBreak())
        self.h1("Планировка и имитация")
        heat = next(
            (s.simulation.get("heatmap") for s in runs if s.simulation and s.simulation.get("heatmap")), None
        )
        if m.layout:
            stats = m.layout.get("stats", {})
            routes = {r["name"]: r["value_m"] for r in stats.get("routes", [])}
            self.add(
                p(
                    "Схема сгенерирована из параметров объекта; линии проходов окрашены "
                    "по интенсивности движения "
                    "роботов в имитации.",
                    "small",
                )
            )
            self.add(picture(charts.layout_map(m.layout["plan"], heat), CONTENT_WIDTH))
            self.add(
                p(
                    "Средние маршруты по графу: "
                    + "; ".join(f"{k.lower()} — {number(v)} м" for k, v in routes.items()),
                    "small",
                )
            )
        for scenario in runs:
            self._simulation(scenario)
        for visual in m.visuals:
            if visual.content_type == "image/png":
                self.add(picture(visual.data), p(visual.caption, "small"))

    def _simulation(self, scenario: ScenarioReport) -> None:
        sim = scenario.simulation or {}
        summary = sim.get("summary") or {}
        if not summary:
            return
        self.add(p(f"Имитация: {scenario.name}", "h2"))
        fleet = ", ".join(f"{f['product_name']} × {f['count']}" for f in sim.get("fleet", []))
        sla = summary["sla"]
        rows = [
            ["Показатель", "Значение"],
            ["Режим", MODE_LABELS.get(sim.get("config", {}).get("mode", ""), "—")],
            ["Парк", fleet],
            ["SLA", f"{number(sla['achieved_pct'])} % при цели {number(sla['target_pct'], 0)} %"],
            [
                "Задач в окне / выполнено роботами / передано людям",
                f"{summary['demand_total']} / {summary['completed']} / {summary['completed_by_humans']}",
            ],
            [
                "Средний и P95 срок",
                f"{number(sla['avg_lead_time_min'])} / {number(sla['p95_lead_time_min'])} мин",
            ],
            ["Загрузка парка", f"{number(summary['utilization']['fleet'] * 100, 0)} %"],
            ["Ожидание в заторах", f"{number(summary['congestion']['total_wait_hours'], 2)} ч"],
            ["Узкое место", summary["bottleneck"]["explanation"]],
        ]
        if summary.get("vs_analytic"):
            rows.append(["Расчёт против имитации", summary["vs_analytic"]["text"]])
        self.add(table(rows, [0.35, 0.65]))
        sweep = sim.get("sweep")
        if sweep and sweep.get("points"):
            self.add(p("Перебор флота: минимальное число роботов с выполнением SLA", "h2"))
            self.add(
                picture(
                    charts.sweep_chart(
                        sweep["points"], sweep.get("recommended_count"), sweep.get("target_pct")
                    )
                )
            )
            self.add(p(sweep.get("explanation", ""), "small"))
            formula, simulated = sweep.get("by_formula"), sweep.get("by_simulation")
            if formula and simulated:
                rows = [["", "По формуле цикла", "По имитации (в расчёте)"]]
                rows.append(
                    [
                        "Роботов (в работе + резерв)",
                        f"{formula['working']} + {formula['reserve']} = {formula['total']}",
                        f"{simulated['working']} + {simulated['reserve']} = {simulated['total']}",
                    ]
                )
                rows.append(
                    [
                        "CAPEX, млн ₽",
                        number(formula["capex_rub"] / MILLION, 1),
                        number(simulated["capex_rub"] / MILLION, 1),
                    ]
                )
                rows.append(
                    ["Окупаемость, лет", number(formula["payback_years"]), number(simulated["payback_years"])]
                )
                rows.append(
                    [
                        "NPV, млн ₽",
                        number(formula["npv_rub"] / MILLION, 1),
                        number(simulated["npv_rub"] / MILLION, 1),
                    ]
                )
                self.add(table(rows, [0.36, 0.32, 0.32]))

    def assumptions(self) -> None:
        m = self.m
        self.add(PageBreak())
        self.h1("Нормативы и допущения")
        self.add(
            p(
                "Каждое число расчёта — параметр объекта, ТТХ из каталога или норматив "
                "с источником. Допущения "
                "команды отмечены и имеют обоснование; их можно изменить в сценарии с фиксацией причины.",
                "small",
            )
        )
        rows: list[list[Any]] = [["Норматив", "Значение", "Источник"]]
        for norm in m.assumptions[:ASSUMPTIONS_SHOWN]:
            rows.append(
                [
                    norm["name"],
                    f"{number(norm['value'], 3)} {norm.get('unit') or ''}".strip(),
                    (norm.get("source") or {}).get("title", ""),
                ]
            )
        self.add(table(rows, [0.42, 0.14, 0.44]))

    def sources(self) -> None:
        self.h1("Источники")
        rows: list[list[Any]] = [["Источник", "Ссылка"]]
        for source in self.m.sources:
            rows.append([source["title"], source.get("url") or "—"])
        self.add(table(rows, [0.6, 0.4]))

    def closing(self) -> None:
        m = self.m
        self.h1("Ограничения и дальнейшие шаги")
        self.bullets(m.limitations)
        analysed = m.analysed
        if analysed:
            self.add(p("Дальнейшие шаги", "h2"))
            self.bullets(analysed.narrative.get("next_steps", []))
        self.gap()
        self.add(boxed(m.disclaimer))

    def build(self) -> list[Flowable]:
        m, has = self.m, self.m.has
        self.cover()
        if has(ReportSection.SUMMARY):
            self.summary()
        if has(ReportSection.OBJECT_PARAMS):
            self.params()
        if has(ReportSection.PROCESSES):
            self.processes()
        if has(ReportSection.MATCHING) and m.matching:
            self.matching()
        if has(ReportSection.SIZING):
            self.sizing()
        if has(ReportSection.ECONOMICS):
            self.economics()
        if has(ReportSection.COMPARISON):
            self.comparison()
        if (
            has(ReportSection.SENSITIVITY)
            or has(ReportSection.MONTE_CARLO)
            or has(ReportSection.SURVEY_PRIORITIES)
        ):
            self.risks()
        if has(ReportSection.SIMULATION):
            self.simulation()
        if has(ReportSection.ASSUMPTIONS):
            self.assumptions()
        if has(ReportSection.SOURCES):
            self.sources()
        if has(ReportSection.NEXT_STEPS):
            self.closing()
        return self.story


def _decorate(model: ReportModel) -> Any:
    def draw(canvas: Canvas, document: SimpleDocTemplate) -> None:
        canvas.saveState()
        canvas.setFont(FONT, 7)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(
            MARGIN, 10 * mm, f"{model.project['name']} · предварительная оценка, требует верификации"
        )
        canvas.drawRightString(PAGE_WIDTH - MARGIN, 10 * mm, f"стр. {document.page}")
        canvas.restoreState()

    return draw


def render_pdf(model: ReportModel) -> bytes:
    _fonts()
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + 4 * mm,
        title=model.title,
        author=model.author,
        subject=model.project["name"],
    )
    decorate = _decorate(model)
    document.build(Builder(model).build(), onFirstPage=decorate, onLaterPages=decorate)
    return buffer.getvalue()
