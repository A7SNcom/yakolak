from pathlib import Path

BRIDGE = Path("scripts/browser_verification_bridge.gd")
SPEC = Path("tests/ux_turn_32_latency.spec.js")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"UX-TURN-32 repair anchor missing: {label}")
    return text.replace(old, new, 1)


def repair_bridge() -> None:
    text = BRIDGE.read_text(encoding="utf-8")
    old = '''\tif not automation or match_controller == null:\n\t\t_publish_ux_turn_32_probe(result)\n\t\treturn\n'''
    new = '''\t# The production scene's gameplay node is PostIntroGameplay. The legacy\n\t# BrowserVerificationBridge name lookup predates that node name, so resolve\n\t# the controller lazily for this WebDriver-only diagnostic callback.\n\tif match_controller == null and intro != null:\n\t\tmatch_controller = intro.get_node_or_null("PostIntroGameplay")\n\tif match_controller == null and intro != null:\n\t\tmatch_controller = intro.get_node_or_null("LocalMatchGameplay")\n\tif not automation or match_controller == null:\n\t\tresult["reason"] = "controller-unavailable"\n\t\t_publish_ux_turn_32_probe(result)\n\t\treturn\n'''
    text = replace_once(text, old, new, "gameplay controller binding")
    BRIDGE.write_text(text, encoding="utf-8")


def repair_spec() -> None:
    text = SPEC.read_text(encoding="utf-8")
    old = '''    last = await client.page.evaluate(() => {\n      window.__yakolakTurn32ProbeResult = null;\n      window.yakolakTurn32ProbeInput();\n      return window.__yakolakTurn32ProbeResult || null;\n    });\n'''
    new = '''    await client.page.evaluate(() => {\n      window.__yakolakTurn32ProbeResult = null;\n      window.yakolakTurn32ProbeInput();\n    });\n    await client.page.waitForFunction(() => window.__yakolakTurn32ProbeResult !== null, null, { timeout: 1000 }).catch(() => {});\n    last = await client.page.evaluate(() => window.__yakolakTurn32ProbeResult || null);\n'''
    text = replace_once(text, old, new, "Godot callback publication wait")
    SPEC.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    repair_bridge()
    repair_spec()
    print("YAKOLAK_UX_TURN_32_WEBDRIVER_REPAIR_OK")
