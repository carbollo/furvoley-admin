#!/usr/bin/env python3
"""Patch Hermes bridge.js to persist WhatsApp QR payload for the CRM UI."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


def resolve_bridge_path() -> Path:
    cli = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    if cli and cli.exists():
        return cli

    from_env = Path(os.environ.get("HERMES_BRIDGE_SCRIPT", "").strip())
    if from_env.exists():
        return from_env

    bundled = Path("/opt/hermes-whatsapp-bridge/bridge.js")
    if bundled.exists():
        return bundled

    try:
        import gateway.platforms.whatsapp as whatsapp_mod

        site_packages = Path(whatsapp_mod.__file__).resolve().parents[2]
        pip_bridge = site_packages / "scripts" / "whatsapp-bridge" / "bridge.js"
        if pip_bridge.exists():
            return pip_bridge
    except ImportError:
        pass

    raise SystemExit(
        "bridge.js not found. Expected /opt/hermes-whatsapp-bridge/bridge.js "
        "or pip site-packages/scripts/whatsapp-bridge/bridge.js"
    )


bridge = resolve_bridge_path()
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
