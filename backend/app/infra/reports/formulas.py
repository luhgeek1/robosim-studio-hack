import math
import re
from collections.abc import Callable
from dataclasses import dataclass

from app.engine.expressions import UNIT_FUNCTIONS

Resolver = Callable[[str], tuple[str, float] | None]

_TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|(.))")
_SYMBOLS = {"×": "*", "−": "-", "÷": "/"}
_UNIT = UNIT_FUNCTIONS
_FUNCTIONS = frozenset({"min", "max", "coalesce", "gain_to_release", *_UNIT})
RELATIVE_TOLERANCE = 1e-6
_BRACKETS: dict[str, tuple[str, str, Callable[[float], float]]] = {
    "(": (")", "({})", lambda v: v),
    "⌈": ("⌉", "ROUNDUP({},0)", lambda v: float(math.ceil(v))),
    "⌊": ("⌋", "ROUNDDOWN({},0)", lambda v: float(math.floor(v))),
}


class UntranslatableError(ValueError):
    """The formula is prose or uses a name the sheet has no cell for: the report writes its value instead."""


@dataclass(frozen=True, slots=True)
class Translation:
    excel: str
    value: float


class _Parser:
    """Recursive descent over the trace formula language; emits an Excel formula and evaluates it at once."""

    def __init__(self, source: str, resolve: Resolver) -> None:
        self.tokens = self._tokenize(source)
        self.pos = 0
        self.resolve = resolve

    @staticmethod
    def _tokenize(source: str) -> list[str]:
        pieces: list[str] = []
        for number, name, symbol in _TOKEN.findall(source):
            piece = number or name or _SYMBOLS.get(symbol, symbol)
            if not piece.strip():
                continue
            if symbol and piece not in "+-*/^(),⌈⌉⌊⌋√":
                raise UntranslatableError(f"symbol {symbol!r}")
            pieces.append(piece)
        return pieces

    def peek(self) -> str | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def take(self, expected: str | None = None) -> str:
        piece = self.peek()
        if piece is None or (expected is not None and piece != expected):
            raise UntranslatableError(f"expected {expected!r}, got {piece!r}")
        self.pos += 1
        return piece

    def parse(self) -> Translation:
        result = self.expr()
        if self.peek() is not None:
            raise UntranslatableError(f"trailing {self.peek()!r}")
        return result

    def expr(self) -> Translation:
        left = self.term()
        while self.peek() in {"+", "-"}:
            op = self.take()
            right = self.term()
            value = left.value + right.value if op == "+" else left.value - right.value
            left = Translation(f"{left.excel}{op}{right.excel}", value)
        return left

    def term(self) -> Translation:
        left = self.unary()
        while self.peek() in {"*", "/"}:
            op = self.take()
            right = self.unary()
            if op == "/" and right.value == 0:
                raise UntranslatableError("division by zero")
            value = left.value * right.value if op == "*" else left.value / right.value
            left = Translation(f"{left.excel}{op}{right.excel}", value)
        return left

    def unary(self) -> Translation:
        if self.peek() == "-":
            self.take()
            inner = self.unary()
            return Translation(f"-{inner.excel}", -inner.value)
        return self.power()

    def power(self) -> Translation:
        base = self.atom()
        if self.peek() == "^":
            self.take()
            exponent = self.unary()
            return Translation(f"{base.excel}^{exponent.excel}", base.value**exponent.value)
        return base

    def atom(self) -> Translation:
        piece = self.take()
        if piece in _BRACKETS:
            return self.bracketed(piece)
        if piece == "√":
            inner = self.atom()
            return Translation(f"SQRT({inner.excel})", math.sqrt(inner.value))
        if piece[0].isdigit():
            return Translation(piece, float(piece))
        if piece in _FUNCTIONS and self.peek() == "(":
            return self.call(piece)
        found = self.resolve(piece)
        if found is None:
            raise UntranslatableError(f"no cell for {piece!r}")
        return Translation(found[0], found[1])

    def bracketed(self, opening: str) -> Translation:
        close, excel, apply = _BRACKETS[opening]
        inner = self.expr()
        self.take(close)
        return Translation(excel.format(inner.excel), apply(inner.value))

    def _args(self) -> list[tuple[int, int]]:
        """Token spans of the call's arguments, so coalesce can skip the ones without cells."""
        spans: list[tuple[int, int]] = []
        start, depth = self.pos, 0
        while True:
            piece = self.take()
            if piece in {"(", "⌈", "⌊"}:
                depth += 1
            elif piece in {")", "⌉", "⌋"} and depth > 0:
                depth -= 1
            elif piece == ")" and depth == 0:
                spans.append((start, self.pos - 1))
                return spans
            elif piece == "," and depth == 0:
                spans.append((start, self.pos - 1))
                start = self.pos

    def _sub(self, span: tuple[int, int]) -> Translation:
        parser = _Parser("", self.resolve)
        parser.tokens = self.tokens[span[0] : span[1]]
        return parser.parse()

    def call(self, name: str) -> Translation:
        self.take("(")
        spans = self._args()
        if name == "coalesce":
            for span in spans:
                try:
                    chosen = self._sub(span)
                except UntranslatableError:
                    continue
                return Translation(f"({chosen.excel})", chosen.value)
            raise UntranslatableError("coalesce without a resolvable argument")
        args = [self._sub(span) for span in spans]
        if name in {"min", "max"}:
            pick = min if name == "min" else max
            joined = ",".join(a.excel for a in args)
            return Translation(f"{name.upper()}({joined})", pick(a.value for a in args))
        (arg,) = args
        if name in _UNIT:
            return Translation(f"(({arg.excel})*{_UNIT[name]})", arg.value * _UNIT[name])
        return Translation(f"(({arg.excel})/(1+{arg.excel}))", arg.value / (1 + arg.value))


def translate(formula: str, resolve: Resolver, expected: float) -> str | None:
    """Excel formula (without «=») for a trace formula, or None when it cannot be reproduced exactly.

    The translation is checked by evaluating it on the same inputs: a live formula in the report always
    gives the value the platform calculated.
    """
    try:
        result = _Parser(formula, resolve).parse()
    except (UntranslatableError, ValueError, OverflowError, ZeroDivisionError):
        return None
    if not math.isclose(result.value, expected, rel_tol=RELATIVE_TOLERANCE, abs_tol=RELATIVE_TOLERANCE):
        return None
    return result.excel
