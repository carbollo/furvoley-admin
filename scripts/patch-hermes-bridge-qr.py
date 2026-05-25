#!/usr/bin/env python3
"""Patch Hermes bridge.js to persist WhatsApp QR payload for the CRM UI."""
from __future__ import annotations

import re
from pathlib import Path

try:
    import gateway.platforms.whatsapp as whatsapp_mod
except ImportError as exc:
    raise SystemExit(f"gateway.platforms.whatsapp not found: {exc}") from exc

bridge = Path(whatsapp_mod.__file__).resolve().parents[2] / "scripts" / "whatsapp-bridge" / "bridge.js"
if not bridge.exists():
    raise SystemExit(f"bridge.js not found: {bridge}")

text = bridge.read_text(encoding="utf-8")
if "latest_qr.txt" in text:
    print(f"already patched: {bridge}")
    raise SystemExit(0)

patched, count = re.subn(
    r"if \(qr\) \{",
    """if (qr) {
    try {
      const _home = process.env.HERMES_HOME || path.join(process.env.HOME || require('os').homedir(), '.hermes');
      const _qrDir = path.join(_home, 'whatsapp');
      mkdirSync(_qrDir, { recursive: true });
      writeFileSync(path.join(_qrDir, 'latest_qr.txt'), qr, 'utf8');
    } catch (_qrErr) {}""",
    text,
    count=1,
)
if count != 1:
    raise SystemExit(f"unexpected bridge.js format (qr block missing): {bridge}")

bridge.write_text(patched, encoding="utf-8")
print(f"patched: {bridge}")
