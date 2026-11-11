# Contributing to HookLedger

Thanks for helping improve the project. This is a portfolio-oriented reliability lab, so correctness, explicit scope boundaries and testability take priority over feature count.

## Development workflow

1. Open an issue describing the problem and expected behavior (without credentials or sensitive data).
2. Fork and work on a focused branch.
3. Include tests for new rule behavior, webhook validation or replay changes.
4. Run backend tests (`cd backend && PYTHONPATH=. pytest -q`) and frontend tests/build (`cd frontend && npm install && npm test && npm run build`).
5. Submit a pull request with a concise description and screenshots for UI changes.

## Principles

- Never expose webhook/admin secrets in frontend bundles or sample files.
- No arbitrary expression evaluation or user-defined code execution in routing rules.
- Don't add outbound HTTP delivery without an allowlist and SSRF risk analysis.
- Keep demo fixtures synthetic and labeled; don't introduce real personal data.
- Avoid claims of enterprise readiness without security and load testing.

Use a respectful, technical tone in reviews and issues.
