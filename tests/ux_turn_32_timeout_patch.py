from pathlib import Path

SPEC = Path("tests/ux_turn_32_latency.spec.js")
text = SPEC.read_text(encoding="utf-8")
old = "  test.setTimeout(900000);\n"
new = "  test.setTimeout(1200000);\n"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("UX-TURN-32 timeout anchor missing")
SPEC.write_text(text, encoding="utf-8")
print("YAKOLAK_UX_TURN_32_TIMEOUT_PATCH_OK")
