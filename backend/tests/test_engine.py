"""Regression tests for the pure numeric routing contract."""
import pytest

from hookledger.engine import evaluate_rule


@pytest.mark.parametrize('actual,expected', [
    ('Infinity', '70'), ('-Infinity', '-100'), ('NaN', '70'),
    ('', '-1'), ('  ', '-1'), ('0x10', '5'),
    (None, '-1'), ({'value': 100}, '5'),
    ('80', ''), ('80', 'Infinity'), ('80', '0x10'),
])
def test_invalid_numeric_operands_do_not_match(actual, expected):
    matched, trace = evaluate_rule({'score': actual}, 'score', 'greater_than', expected)
    assert matched is False
    assert trace[1]['result'] == 'skipped'


@pytest.mark.parametrize('actual,expected,result', [
    ('80', '70', True), ('1e2', '70', True),
    (70, '70', False), ('-1.5', '-2', True),
    (False, '-1', True), ('0', '1', False),
])
def test_finite_decimal_comparisons(actual, expected, result):
    matched, _ = evaluate_rule({'score': actual}, 'score', 'greater_than', expected)
    assert matched is result
