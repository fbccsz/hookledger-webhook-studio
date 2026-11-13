"""Pure, deterministic routing rules. No expression evaluation or arbitrary code."""
from __future__ import annotations
import math
import re
from typing import Any

OPERATORS = frozenset({'equals', 'contains', 'greater_than', 'exists'})
DECIMAL_PATTERN = re.compile(r'^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?

def get_path(payload: dict[str, Any], path: str) -> tuple[bool, Any]:
    """Safely traverse a short dot-delimited object path (no eval / indexing)."""
    if not path or len(path) > 96 or len(path.split('.')) > 6:
        return False, None
    value: Any = payload
    for key in path.split('.'):
        if not key.isidentifier() or not isinstance(value, dict) or key not in value:
            return False, None
        value = value[key]
    return True, value


def evaluate_rule(payload: dict[str, Any], field: str, operator: str, expected: str) -> tuple[bool, list[dict[str, Any]]]:
    """Evaluate one condition and produce a human-readable, serializable trace."""
    found, actual = get_path(payload, field)
    if operator not in OPERATORS:
        raise ValueError('unsupported_operator')
    if operator == 'exists':
        matched = found and actual is not None
    elif not found:
        matched = False
    elif operator == 'equals':
        matched = str(actual).casefold() == expected.casefold()
    elif operator == 'contains':
        matched = expected.casefold() in str(actual).casefold()
    else:
        actual_number = parse_finite_decimal(actual)
        expected_number = parse_finite_decimal(expected)
        matched = (
            actual_number is not None and expected_number is not None
            and actual_number > expected_number
        )
    trace = [
        {'step': 'payload', 'result': 'ok', 'detail': 'JSON object accepted'},
        {'step': 'condition', 'result': 'matched' if matched else 'skipped',
         'detail': f'{field} {operator} {expected}'[:150]},
        {'step': 'route', 'result': 'matched' if matched else 'filtered',
         'detail': 'Continue to destination' if matched else 'Event did not match rule'},
    ]
    return matched, trace


def resolve_status(matched: bool, delivery_mode: str) -> tuple[str, dict[str, str]]:
    if not matched:
        return 'filtered', {'step': 'delivery', 'result': 'skipped', 'detail': 'Rule did not match'}
    if delivery_mode == 'sandbox_failure':
        return 'failed', {'step': 'delivery', 'result': 'failed', 'detail': 'Intentional sandbox failure (no external delivery)'}
    return 'delivered', {'step': 'delivery', 'result': 'ok', 'detail': 'Archived locally — no outbound request made'}
)


def parse_finite_decimal(value: Any) -> float | None:
    """Convert finite JSON scalars using the same decimal syntax as the UI."""
    if isinstance(value, str):
        value = value.strip()
        if not DECIMAL_PATTERN.fullmatch(value):
            return None
    elif not isinstance(value, (int, float, bool)):
        return None
    try:
        number = float(value)
    except (ValueError, TypeError, OverflowError):
        return None
    return number if math.isfinite(number) else None


def get_path(payload: dict[str, Any], path: str) -> tuple[bool, Any]:
    """Safely traverse a short dot-delimited object path (no eval / indexing)."""
    if not path or len(path) > 96 or len(path.split('.')) > 6:
        return False, None
    value: Any = payload
    for key in path.split('.'):
        if not key.isidentifier() or not isinstance(value, dict) or key not in value:
            return False, None
        value = value[key]
    return True, value


def evaluate_rule(payload: dict[str, Any], field: str, operator: str, expected: str) -> tuple[bool, list[dict[str, Any]]]:
    """Evaluate one condition and produce a human-readable, serializable trace."""
    found, actual = get_path(payload, field)
    if operator not in OPERATORS:
        raise ValueError('unsupported_operator')
    if operator == 'exists':
        matched = found and actual is not None
    elif not found:
        matched = False
    elif operator == 'equals':
        matched = str(actual).casefold() == expected.casefold()
    elif operator == 'contains':
        matched = expected.casefold() in str(actual).casefold()
    else:
        try:
            matched = float(actual) > float(expected)
        except (ValueError, TypeError, OverflowError):
            matched = False
    trace = [
        {'step': 'payload', 'result': 'ok', 'detail': 'JSON object accepted'},
        {'step': 'condition', 'result': 'matched' if matched else 'skipped',
         'detail': f'{field} {operator} {expected}'[:150]},
        {'step': 'route', 'result': 'matched' if matched else 'filtered',
         'detail': 'Continue to destination' if matched else 'Event did not match rule'},
    ]
    return matched, trace


def resolve_status(matched: bool, delivery_mode: str) -> tuple[str, dict[str, str]]:
    if not matched:
        return 'filtered', {'step': 'delivery', 'result': 'skipped', 'detail': 'Rule did not match'}
    if delivery_mode == 'sandbox_failure':
        return 'failed', {'step': 'delivery', 'result': 'failed', 'detail': 'Intentional sandbox failure (no external delivery)'}
    return 'delivered', {'step': 'delivery', 'result': 'ok', 'detail': 'Archived locally — no outbound request made'}
