from pathlib import Path

SPEC = Path("tests/ux_turn_32_latency.spec.js")

if __name__ == "__main__":
    text = SPEC.read_text(encoding="utf-8")
    old = '''  const input = await selectFirstLegalPiece(targetClient, expectedPlayer);\n  await targetClient.page.waitForFunction(player => {\n    const d = document.body.dataset;\n    return Number(d.yakolakAuthoritativeTurnPlayer) === player && d.yakolakGameplay === 'ready';\n  }, expectedPlayer, { timeout: 3000 }).catch(() => {});\n  await sleep(32);\n  const timeline = await targetClient.page.evaluate(() => window.__turn32Timeline || []);\n'''
    new = '''  const input = await selectFirstLegalPiece(targetClient, expectedPlayer);\n  await sleep(32);\n  const timeline = await targetClient.page.evaluate(() => window.__turn32Timeline || []);\n'''
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit("UX-TURN-32 post-accept idle anchor missing")
    SPEC.write_text(text, encoding="utf-8")
    print("YAKOLAK_UX_TURN_32_POST_ACCEPT_IDLE_REMOVED")
