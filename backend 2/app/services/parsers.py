"""Turn uploaded files (xlsx / csv / json / txt) into a flat list of RawRecord.

Parsers are format-aware but *not* domain-aware: they never decide what a field means.
"""

from __future__ import annotations

import csv
import io
import json
import re
from typing import Any

import openpyxl

from ..schemas import RawRecord

HEADER_NAME = ("параметр", "parameter", "показател", "название", "name", "field")
HEADER_VALUE = ("базовое значение", "значение", "value", "val")
HEADER_UNIT = ("ед. изм", "ед.изм", "единиц", "unit")


def parse_upload(filename: str, content: bytes) -> list[RawRecord]:
    name = filename.lower()
    if name.endswith((".xlsx", ".xlsm")):
        return parse_xlsx(content)
    if name.endswith(".csv"):
        return parse_csv(content.decode("utf-8-sig", errors="replace"))
    if name.endswith(".json"):
        return parse_json(json.loads(content.decode("utf-8")))
    text = content.decode("utf-8", errors="replace")
    try:
        return parse_json(json.loads(text))
    except Exception:
        return parse_text(text)


def parse_json(data: Any, prefix: str = "") -> list[RawRecord]:
    out: list[RawRecord] = []
    if isinstance(data, dict):
        # {"value":..,"unit":..} leaf convention
        if "value" in data and len(data) <= 4 and all(k in ("value", "unit", "source", "note") for k in data):
            return [RawRecord(field=prefix, value=data["value"], unit=data.get("unit"))]
        for k, v in data.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            out.extend(parse_json(v, key))
    elif isinstance(data, list):
        for i, v in enumerate(data):
            if isinstance(v, dict) and ("name" in v or "field" in v or "parameter" in v) and "value" in v:
                out.append(RawRecord(field=str(v.get("name") or v.get("field") or v.get("parameter")), value=v["value"], unit=v.get("unit")))
            else:
                out.extend(parse_json(v, f"{prefix}[{i}]"))
    else:
        out.append(RawRecord(field=prefix, value=data))
    return out


def _rows_to_records(rows: list[list[Any]], context: str = "") -> list[RawRecord]:
    rows = [r for r in rows if r and any(c not in (None, "") for c in r)]
    if not rows:
        return []
    name_col, value_col, unit_col = 0, None, None
    start = 0
    for i, r in enumerate(rows[:10]):
        cells = [str(c).strip().lower() if c is not None else "" for c in r]
        if any(h in c for c in cells for h in HEADER_NAME) and any(h in c for c in cells for h in HEADER_VALUE):
            for j, c in enumerate(cells):
                if any(h in c for h in HEADER_NAME) and name_col == 0:
                    name_col = j
                if any(h in c for h in HEADER_VALUE) and value_col is None:
                    value_col = j
                if any(h in c for h in HEADER_UNIT) and unit_col is None:
                    unit_col = j
            start = i + 1
            break
    if value_col is None:
        value_col = 1 if len(rows[0]) > 1 else 0
    section = ""
    out: list[RawRecord] = []
    for r in rows[start:]:
        cells = list(r) + [None] * 6
        name = cells[name_col]
        if name is None or str(name).strip() == "":
            continue
        sname = str(name).strip()
        value = cells[value_col]
        if sname.startswith("▌") or (value in (None, "") and all(c in (None, "") for c in cells[1:6])):
            section = sname.strip("▌ ").strip()
            continue
        unit = cells[unit_col] if unit_col is not None else None
        out.append(RawRecord(field=sname, value=value, unit=str(unit).strip() if unit not in (None, "", "-") else None, context=f"{context}/{section}".strip("/")))
    return out


def parse_xlsx(content: bytes) -> list[RawRecord]:
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    out: list[RawRecord] = []
    for ws in wb.worksheets:
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        out.extend(_rows_to_records(rows, ws.title))
    return out


def parse_csv(text: str) -> list[RawRecord]:
    dialect = csv.Sniffer().sniff(text[:2000], delimiters=";,\t") if text.strip() else csv.excel
    rows = [row for row in csv.reader(io.StringIO(text), dialect)]
    return _rows_to_records(rows)


_LINE = re.compile(r"^\s*(?P<name>[^:=]+?)\s*[:=]\s*(?P<value>.+?)\s*$")


def parse_text(text: str) -> list[RawRecord]:
    out = []
    for line in text.splitlines():
        m = _LINE.match(line)
        if m:
            out.append(RawRecord(field=m.group("name"), value=m.group("value")))
    return out
