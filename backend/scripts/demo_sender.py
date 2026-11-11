#!/usr/bin/env python3
"""Send a HMAC-signed synthetic webhook to a local HookLedger route.

Usage: cd backend && python scripts/demo_sender.py --route lead-qualification
Never sends real personal or payment data.
"""
import argparse
import hashlib
import hmac
import json
import os
import sys
import uuid
import httpx


def main() -> int:
    parser = argparse.ArgumentParser(description='Send a synthetic signed webhook to HookLedger')
    parser.add_argument('--route', default='lead-qualification')
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--score', type=int, default=87)
    args = parser.parse_args()
    secret = os.environ.get('HOOKLEDGER_WEBHOOK_SECRET')
    if not secret:
        print('Error: set HOOKLEDGER_WEBHOOK_SECRET first', file=sys.stderr)
        return 2
    payload = {'type': 'lead.created', 'lead': {'score': args.score, 'email': 'sample@example.com'}, 'environment': 'local-test'}
    raw = json.dumps(payload, separators=(',', ':')).encode()
    digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    result = httpx.post(f'{args.url.rstrip("/")}/hooks/{args.route}', content=raw,
        headers={'Content-Type': 'application/json', 'Idempotency-Key': f'demo-{uuid.uuid4()}', 'X-HookLedger-Signature': f'sha256={digest}'}, timeout=10)
    print(result.status_code, result.text)
    return 0 if result.is_success else 1

if __name__ == '__main__':
    raise SystemExit(main())
