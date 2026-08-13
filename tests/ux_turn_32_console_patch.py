from pathlib import Path

SPEC = Path("tests/ux_turn_32_latency.spec.js")

text = SPEC.read_text(encoding="utf-8")
old = "  const page = await context.newPage();\n"
new = """  const page = await context.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      process.stderr.write(`[browser-${seat}-${msg.type()}] ${msg.text()}\\n`);
    }
  });
  page.on('pageerror', error => process.stderr.write(`[browser-${seat}-pageerror] ${error?.stack || error}\\n`));
"""
if old not in text and "page.on('pageerror'" not in text:
    raise SystemExit("UX-TURN-32 console patch anchor missing")
if old in text:
    text = text.replace(old, new, 1)
SPEC.write_text(text, encoding="utf-8")
print("YAKOLAK_UX_TURN_32_CONSOLE_PATCH_OK")
