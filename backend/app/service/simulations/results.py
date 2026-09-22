import gzip
import json
from dataclasses import asdict
from typing import Any

from app.engine.simulation import SimResult
from app.engine.simulation.models import SimEvent


def summary_json(result: SimResult, skipped: dict[str, str]) -> dict[str, Any]:
    summary = asdict(result.summary)
    summary.pop("skipped", None)
    summary["baseline"] = None
    summary["skipped_processes"] = [{"process_key": k, "reason": v} for k, v in skipped.items()]
    return summary


def timeline_json(result: SimResult) -> list[dict[str, Any]]:
    return [asdict(point) for point in result.record.timeline]


def robots_json(result: SimResult) -> list[dict[str, Any]]:
    return [
        {"id": rid, "process_key": process, "product_name": product, "speed_mps": speed, "home_node": home}
        for rid, process, product, speed, home in result.record.robot_meta
    ]


def _event(event: SimEvent) -> dict[str, Any]:
    body = {k: v for k, v in asdict(event).items() if v not in (None, ())}
    if "path" in body:
        body["path"] = list(body["path"])
    return body


def pack_events(events: list[SimEvent]) -> bytes:
    payload = json.dumps([_event(e) for e in events], ensure_ascii=False, separators=(",", ":"))
    return gzip.compress(payload.encode())


def unpack_events(blob: bytes | None) -> list[dict[str, Any]]:
    return json.loads(gzip.decompress(blob)) if blob else []


def window(
    events: list[dict[str, Any]], from_s: float, to_s: float, robots: set[str] | None
) -> list[dict[str, Any]]:
    """Events inside [from_s, to_s) plus moves already under way at from_s, so the player can place robots."""
    result = []
    for event in events:
        if robots and event.get("robot_id") not in robots:
            continue
        t = event["t"]
        ongoing = event["type"] == "move" and t < from_s < (event.get("eta") or t)
        if from_s <= t < to_s or ongoing:
            result.append(event)
    return result


def resample(points: list[dict[str, Any]], step_min: float) -> list[dict[str, Any]]:
    """Timeline is stored per minute; the chart asks for a coarser step."""
    if step_min <= 1 or not points:
        return points
    result = []
    next_t = 0.0
    for point in points:
        if point["t_min"] >= next_t:
            result.append(point)
            next_t = point["t_min"] + step_min
    if result[-1] is not points[-1]:
        result.append(points[-1])
    return result
