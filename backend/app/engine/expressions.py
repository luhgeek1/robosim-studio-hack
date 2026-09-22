import ast
import operator
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import lru_cache

Number = float

_BINARY: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}
_COMPARE: dict[type[ast.cmpop], Callable[[float, float], bool]] = {
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
}
_FUNCTIONS = frozenset({"min", "max", "coalesce"})


class ExpressionError(ValueError):
    pass


class MissingValueError(ExpressionError):
    def __init__(self, names: list[str]) -> None:
        self.names = names
        super().__init__(f"missing values: {', '.join(names)}")


@dataclass(frozen=True, slots=True)
class Expression:
    """Arithmetic over named inputs; the only language allowed in seed formulas.

    Numeric literals are rejected on purpose: every number must come from a parameter or a norm with a source
    (ТЗ 3.5.1), so a formula can never hide a coefficient.
    """

    source: str
    tree: ast.expr

    @property
    def names(self) -> frozenset[str]:
        return frozenset(
            node.id
            for node in ast.walk(self.tree)
            if isinstance(node, ast.Name) and node.id not in _FUNCTIONS
        )

    def evaluate(self, values: Mapping[str, float | None]) -> float:
        result = _eval(self.tree, values)
        if isinstance(result, bool):
            raise ExpressionError(f"{self.source!r} is a condition, not a number")
        return result

    def check(self, values: Mapping[str, float | None]) -> bool:
        result = _eval(self.tree, values)
        if not isinstance(result, bool):
            raise ExpressionError(f"{self.source!r} is not a condition")
        return result


def _validate(node: ast.AST, source: str) -> None:
    for child in ast.walk(node):
        allowed = (
            isinstance(
                child,
                ast.Expression
                | ast.BinOp
                | ast.Compare
                | ast.Name
                | ast.Load
                | ast.Call
                | ast.UnaryOp
                | ast.USub,
            )
            or type(child) in _BINARY
            or type(child) in _COMPARE
        )
        if isinstance(child, ast.Constant):
            raise ExpressionError(f"{source!r}: numeric literals are not allowed, use a parameter or a norm")
        if isinstance(child, ast.Call) and not (
            isinstance(child.func, ast.Name) and child.func.id in _FUNCTIONS
        ):
            raise ExpressionError(f"{source!r}: only {sorted(_FUNCTIONS)} can be called")
        if not allowed:
            raise ExpressionError(f"{source!r}: {type(child).__name__} is not allowed")


@lru_cache(maxsize=512)
def parse(source: str) -> Expression:
    try:
        tree = ast.parse(source.strip(), mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"{source!r}: {exc.msg}") from exc
    _validate(tree, source)
    return Expression(source=source, tree=tree.body)


def _eval(node: ast.expr, values: Mapping[str, float | None]) -> float | bool:
    if isinstance(node, ast.Name):
        value = values.get(node.id)
        if value is None:
            raise MissingValueError([node.id])
        return float(value)
    if isinstance(node, ast.UnaryOp):
        return -_number(node.operand, values)
    if isinstance(node, ast.BinOp):
        left, right = _number(node.left, values), _number(node.right, values)
        if isinstance(node.op, ast.Div) and right == 0:
            raise ExpressionError("division by zero")
        return _BINARY[type(node.op)](left, right)
    if isinstance(node, ast.Compare):
        left = _number(node.left, values)
        for op, comparator in zip(node.ops, node.comparators, strict=True):
            right = _number(comparator, values)
            if not _COMPARE[type(op)](left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        return _call(node.func.id, node.args, values)
    raise ExpressionError(f"unsupported node {type(node).__name__}")


def _number(node: ast.expr, values: Mapping[str, float | None]) -> float:
    result = _eval(node, values)
    if isinstance(result, bool):
        raise ExpressionError("condition used as a number")
    return result


def _call(name: str, args: list[ast.expr], values: Mapping[str, float | None]) -> float:
    if name == "coalesce":
        missing: list[str] = []
        for arg in args:
            try:
                return _number(arg, values)
            except MissingValueError as exc:
                missing += exc.names
        raise MissingValueError(missing)
    numbers = [_number(arg, values) for arg in args]
    return min(numbers) if name == "min" else max(numbers)
