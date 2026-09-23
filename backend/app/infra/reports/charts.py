import textwrap
from io import BytesIO
from typing import Any

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.patches import Polygon

MILLION = 1_000_000
DPI = 160
MONTHS_PER_YEAR = 12
# Below 20 million on an axis, whole millions repeat on neighbouring ticks: show one decimal.
SMALL_SPAN = 20 * MILLION
WRAP = 38
_PALETTE = ["#1F3A5F", "#2E86AB", "#E07A5F", "#81B29A", "#F2CC8F", "#6D597A"]
_ZONE_COLORS = {
    "storage": "#E8EEF5",
    "receiving": "#FCE8D8",
    "shipping": "#DDEFD9",
    "picking": "#EFE3F5",
    "station": "#D9C7E6",
    "charging": "#FFF3C4",
    "packing": "#E5F2F2",
    "corridor": "#F7F7F7",
    "buffer": "#F2F2F2",
}
plt.rcParams.update(
    {"font.family": "DejaVu Sans", "font.size": 8, "axes.spines.top": False, "axes.spines.right": False}
)


def _png(figure: Figure) -> bytes:
    buffer = BytesIO()
    figure.savefig(buffer, format="png", dpi=DPI, bbox_inches="tight")
    plt.close(figure)
    return buffer.getvalue()


def _millions(value: float, span: float) -> str:
    digits = 1 if span < SMALL_SPAN else 0
    return f"{value / MILLION:,.{digits}f}".replace(",", " ").replace(".", ",")


def _money_axis(axis: Axes) -> None:
    low, high = axis.get_ylim()
    axis.yaxis.set_major_formatter(lambda value, _: _millions(value, high - low))
    axis.set_ylabel("млн ₽")
    axis.axhline(0, color="#999999", linewidth=0.8)
    axis.grid(axis="y", color="#EEEEEE")


def comparison_chart(curves: dict[str, list[dict[str, Any]]]) -> bytes:
    """Cumulative cash flow against «как сейчас» by year: a curve crossing zero is a payback."""
    figure, axis = plt.subplots(figsize=(7.2, 3.0))
    for index, (name, points) in enumerate(curves.items()):
        axis.plot(
            [p["period"] for p in points],
            [p["cumulative_rub"] for p in points],
            marker="o",
            markersize=3,
            color=_PALETTE[index % len(_PALETTE)],
            label=name,
        )
    _money_axis(axis)
    axis.set_xlabel("год")
    axis.legend(frameon=False, fontsize=7)
    return _png(figure)


def cashflow_chart(monthly: list[dict[str, Any]], upfront: float) -> bytes:
    figure, axis = plt.subplots(figsize=(7.2, 2.6))
    months = [0, *[p["period"] for p in monthly]]
    cumulative = [-upfront, *[p["cumulative_rub"] for p in monthly]]
    discounted = [-upfront, *[p.get("discounted_cumulative_rub") or 0.0 for p in monthly]]
    axis.plot(months, cumulative, color=_PALETTE[0], label="накопленный поток")
    axis.plot(months, discounted, color=_PALETTE[2], linestyle="--", label="дисконтированный")
    axis.set_xticks(
        range(0, months[-1] + 1, MONTHS_PER_YEAR),
        [str(m // MONTHS_PER_YEAR) for m in range(0, months[-1] + 1, MONTHS_PER_YEAR)],
    )
    axis.set_xlabel("год")
    _money_axis(axis)
    axis.legend(frameon=False, fontsize=7)
    return _png(figure)


def tornado_chart(items: list[dict[str, Any]], base: float | None) -> bytes:
    shown = items[:10][::-1]
    figure, axis = plt.subplots(figsize=(7.2, 0.45 * len(shown) + 0.8))
    center = base or 0.0
    for row, item in enumerate(shown):
        low, high = item["metric_at_low"], item["metric_at_high"]
        if low is None or high is None:
            continue
        axis.barh(row, low - center, left=center, color=_PALETTE[1], height=0.6)
        axis.barh(row, high - center, left=center, color=_PALETTE[2], height=0.6)
    axis.set_yticks(range(len(shown)), [textwrap.fill(item["name"], WRAP) for item in shown])
    axis.axvline(center, color="#333333", linewidth=0.8)
    low, high = axis.get_xlim()
    axis.xaxis.set_major_formatter(lambda value, _: _millions(value, high - low))
    axis.set_xlabel("NPV, млн ₽ (синий — нижняя граница драйвера, оранжевый — верхняя)")
    return _png(figure)


def histogram_chart(histogram: list[dict[str, Any]], p10: float, p50: float, p90: float) -> bytes:
    figure, axis = plt.subplots(figsize=(7.2, 2.4))
    centers = [(b["from"] + b["to"]) / 2 for b in histogram]
    widths = [b["to"] - b["from"] for b in histogram]
    axis.bar(centers, [b["count"] for b in histogram], width=widths, color=_PALETTE[1], edgecolor="white")
    for value, label in ((p10, "P10"), (p50, "P50"), (p90, "P90")):
        axis.axvline(value, color=_PALETTE[2], linestyle="--", linewidth=0.8)
        axis.text(value, axis.get_ylim()[1] * 0.92, label, fontsize=7, ha="center")
    low, high = axis.get_xlim()
    axis.xaxis.set_major_formatter(lambda value, _: _millions(value, high - low))
    axis.set_xlabel("NPV, млн ₽")
    axis.set_ylabel("прогонов")
    return _png(figure)


def sweep_chart(points: list[dict[str, Any]], recommended: int | None, target: float | None) -> bytes:
    figure, axis = plt.subplots(figsize=(7.2, 2.6))
    counts = [p["count"] for p in points]
    axis.plot(counts, [p["sla_achieved_pct"] for p in points], marker="o", color=_PALETTE[0], label="SLA, %")
    axis.plot(
        counts,
        [p["utilization"] * 100 for p in points],
        marker="s",
        color=_PALETTE[3],
        label="загрузка парка, %",
    )
    if target is not None:
        axis.axhline(target, color=_PALETTE[2], linestyle="--", linewidth=0.8, label=f"цель {target:.0f} %")
    if recommended is not None:
        axis.axvline(recommended, color="#333333", linewidth=0.8)
    axis.set_xlabel("роботов")
    axis.set_ylim(0, 105)
    axis.legend(frameon=False, fontsize=7)
    return _png(figure)


def layout_map(plan: dict[str, Any], heat: dict[str, Any] | None) -> bytes:
    """The plan from above: zones, racks and, if a simulation ran, the aisles coloured by robot traffic."""
    width, height = plan["width_m"], plan["height_m"]
    figure, axis = plt.subplots(figsize=(7.2, 7.2 * height / width + 0.4))
    for zone in plan["zones"]:
        color = _ZONE_COLORS.get(zone["kind"], "#F2F2F2")
        axis.add_patch(
            Polygon(zone["polygon"], closed=True, facecolor=color, edgecolor="#CCCCCC", linewidth=0.3)
        )
    for rack in plan.get("racks", []):
        axis.add_patch(Polygon(rack["polygon"], closed=True, facecolor="#9FB3C8", edgecolor="none"))
    nodes = {n["id"]: n for n in plan["nodes"]}
    intensity = {e["edge_id"]: e.get("intensity", 0.0) for e in (heat or {}).get("edges", [])}
    for edge in plan["edges"]:
        a, b = nodes.get(edge["from"]), nodes.get(edge["to"])
        if a is None or b is None:
            continue
        level = intensity.get(edge["id"], 0.0)
        color = plt.get_cmap("YlOrRd")(0.25 + 0.75 * level) if level > 0 else "#D0D0D0"
        axis.plot([a["x"], b["x"]], [a["y"], b["y"]], color=color, linewidth=0.4 + 2.2 * level)
    markers = {
        "dock_in": ("v", _PALETTE[2]),
        "dock_out": ("^", _PALETTE[3]),
        "charger": ("s", "#C9A227"),
        "pick_station": ("D", _PALETTE[5]),
    }
    for kind, (marker, color) in markers.items():
        points = [n for n in plan["nodes"] if n["kind"] == kind]
        axis.scatter(
            [p["x"] for p in points], [p["y"] for p in points], marker=marker, s=14, color=color, zorder=3
        )
    axis.set_xlim(0, width)
    axis.set_ylim(height, 0)
    axis.set_aspect("equal")
    axis.set_xlabel("м")
    return _png(figure)
