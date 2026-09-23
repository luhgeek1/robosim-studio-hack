import re
from functools import cache
from pathlib import Path
from typing import Any

import yaml
from httpx import Response
from jsonschema import Draft202012Validator

CONTRACT = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.bundled.yaml"
METHODS = {"get", "post", "put", "patch", "delete"}
# docs/api/README.md: any operation may answer these with a Problem; the contract lists only specific ones.
GENERIC_ERRORS = {"400", "401", "403", "404", "422", "429"}


@cache
def _spec() -> dict[str, Any]:
    spec: dict[str, Any] = yaml.load(CONTRACT.read_text(encoding="utf-8"), Loader=yaml.CSafeLoader)
    return spec


@cache
def _routes() -> list[tuple[str, re.Pattern[str], str]]:
    routes = []
    for path, item in _spec()["paths"].items():
        pattern = re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", path) + "$")
        for method, op in item.items():
            if method in METHODS:
                routes.append((method.upper(), pattern, op["operationId"]))
    # Literal segments win over parameters: /catalog/facets before /catalog/{product_id}.
    return sorted(routes, key=lambda r: r[1].pattern.count("[^/]+"))


@cache
def _validator(operation_id: str, status: str, media: str) -> Draft202012Validator | None:
    spec = _spec()
    op = next(
        op
        for item in spec["paths"].values()
        for method, op in item.items()
        if method in METHODS and op["operationId"] == operation_id
    )
    response = op["responses"][status]
    if "$ref" in response:
        response = spec["components"]["responses"][response["$ref"].split("/")[-1]]
    schema = (response.get("content") or {}).get(media, {}).get("schema")
    if schema is None:
        return None
    return Draft202012Validator({**schema, "components": spec["components"]})


@cache
def _problem_validator() -> Draft202012Validator:
    spec = _spec()
    return Draft202012Validator({"$ref": "#/components/schemas/Problem", "components": spec["components"]})


def operation(method: str, path: str) -> str | None:
    return next((op for m, pattern, op in _routes() if m == method and pattern.match(path)), None)


def _schema_errors(operation_id: str, status: str, media: str, response: Response, listed: bool) -> list[str]:
    validator = _validator(operation_id, status, media) if listed else _problem_validator()
    if validator is None:
        return []
    found = []
    for error in validator.iter_errors(response.json()):
        deepest = max(error.context, key=lambda e: len(e.absolute_path)) if error.context else error
        where = "/".join(str(p) for p in deepest.absolute_path) or "<root>"
        message = deepest.message if len(deepest.message) < 160 else f"{deepest.validator} нарушен"
        found.append(f"{operation_id} {status} {where}: {message}")
    return found


def violations(method: str, path: str, response: Response) -> list[str]:
    """What in this response the contract does not allow: the frontend types are generated from it."""
    operation_id = operation(method, path)
    if operation_id is None:
        return []
    op = next(
        op
        for item in _spec()["paths"].values()
        for m, op in item.items()
        if m in METHODS and op["operationId"] == operation_id
    )
    status = str(response.status_code)
    listed = status in op["responses"]
    if not listed and status not in GENERIC_ERRORS:
        return [f"{operation_id}: код {status} не описан в контракте"]
    problem = {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/Problem"}}}}
    declared = op["responses"].get(status, problem)
    if "$ref" in declared:
        declared = _spec()["components"]["responses"][declared["$ref"].split("/")[-1]]
    content = declared.get("content") or {}
    media = response.headers.get("content-type", "").split(";")[0].strip()
    if media == "application/problem+json" and media not in content and "application/json" in content:
        media = "application/json"
    if not content or media == "text/event-stream":
        return []
    if media not in content:
        return [f"{operation_id} {status}: тип {media} не описан ({', '.join(content)})"]
    return _schema_errors(operation_id, status, media, response, listed) if media.endswith("json") else []
