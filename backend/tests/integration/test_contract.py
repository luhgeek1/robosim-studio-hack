"""Every operation the backend exposes must exist in docs/api with the same method, path and operationId.

Coverage (implemented / all contract operations) is reported, not enforced: the contract leads the code.
"""

from pathlib import Path
from typing import Any

import pytest
import yaml

from app.main import create_app
from tests.conftest import make_settings

CONTRACT = Path(__file__).resolve().parents[3] / "docs" / "api" / "openapi.bundled.yaml"
METHODS = {"get", "post", "put", "patch", "delete"}


def _operations(spec: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    return {
        (method, path): op
        for path, item in spec["paths"].items()
        for method, op in item.items()
        if method in METHODS
    }


@pytest.fixture(scope="module")
def contract_ops() -> dict[tuple[str, str], dict[str, Any]]:
    return _operations(yaml.safe_load(CONTRACT.read_text(encoding="utf-8")))


@pytest.fixture(scope="module")
def app_ops() -> dict[tuple[str, str], dict[str, Any]]:
    return _operations(create_app(make_settings()).openapi())


def test_every_backend_operation_is_in_contract(app_ops: dict, contract_ops: dict) -> None:
    extra = sorted(set(app_ops) - set(contract_ops))
    assert not extra, f"Operations missing from docs/api: {extra}"


def test_operation_ids_match(app_ops: dict, contract_ops: dict) -> None:
    mismatched = [
        (key, op.get("operationId"), contract_ops[key].get("operationId"))
        for key, op in app_ops.items()
        if key in contract_ops and op.get("operationId") != contract_ops[key].get("operationId")
    ]
    assert not mismatched


def test_success_status_codes_match(app_ops: dict, contract_ops: dict) -> None:
    def success(op: dict) -> set[str]:
        return {code for code in op["responses"] if code.startswith("2")}

    mismatched = [
        (key, success(op), success(contract_ops[key]))
        for key, op in app_ops.items()
        if key in contract_ops and not success(op) & success(contract_ops[key])
    ]
    assert not mismatched


def test_report_coverage(app_ops: dict, contract_ops: dict) -> None:
    implemented = len(set(app_ops) & set(contract_ops))
    print(f"\ncontract coverage: {implemented}/{len(contract_ops)} operations")
