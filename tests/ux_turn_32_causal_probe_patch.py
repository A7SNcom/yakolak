from pathlib import Path

BRIDGE = Path("scripts/browser_verification_bridge.gd")
SPEC = Path("tests/ux_turn_32_latency.spec.js")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"UX-TURN-32 causal patch anchor missing: {label}")
    return text.replace(old, new, 1)


def patch_bridge() -> None:
    text = BRIDGE.read_text(encoding="utf-8")
    text = replace_once(
        text,
        '''\tvar best_size: String = ""\n\tvar best_distance: float = INF\n\n\tfor index: int in range(records.size()):\n\t\tvar record: Dictionary = records[index] as Dictionary\n''',
        '''\tvar best_size: String = ""\n\tvar best_distance: float = INF\n\tvar selected_before: int = int(match_controller.get("selected_index"))\n\n\tfor index: int in range(records.size()):\n\t\t# A valid latency sample must prove that this exact input caused a new\n\t\t# selection. Never target the piece that was already selected before\n\t\t# dispatch, otherwise stale state from a previous sample can look accepted.\n\t\tif index == selected_before:\n\t\t\tcontinue\n\t\tvar record: Dictionary = records[index] as Dictionary\n''',
        "skip pre-selected target",
    )
    text = replace_once(
        text,
        '''\n\tvar selected_before: int = int(match_controller.get("selected_index"))\n\tvar event := InputEventMouseButton.new()\n''',
        '''\n\tvar event := InputEventMouseButton.new()\n''',
        "remove duplicate selected_before",
    )
    text = replace_once(
        text,
        '''\tresult["selectedAfter"] = selected_after\n\tresult["accepted"] = selected_after == best_index\n\tresult["reason"] = "accepted" if bool(result["accepted"]) else "input-blocked"\n''',
        '''\tresult["selectedAfter"] = selected_after\n\tvar causal_selection_changed: bool = selected_before != best_index and selected_after == best_index\n\tresult["causalSelectionChanged"] = causal_selection_changed\n\tresult["accepted"] = causal_selection_changed\n\tresult["reason"] = "accepted-causal-selection" if causal_selection_changed else "input-blocked"\n''',
        "causal acceptance",
    )
    BRIDGE.write_text(text, encoding="utf-8")


def patch_spec() -> None:
    text = SPEC.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "    if (last?.accepted) {\n",
        "    if (last?.accepted && last?.causalSelectionChanged === true && Number(last?.selectedBefore) !== Number(last?.targetIndex)) {\n",
        "browser causal acceptance",
    )
    text = replace_once(
        text,
        "      authToInteract: stats(rows, 'authToInteractMs'),\n    });\n",
        "      authToInteract: stats(rows, 'authToInteractMs'),\n      causalSelection: {\n        n: rows.length,\n        all: rows.every(row => row.probeResult?.causalSelectionChanged === true && Number(row.probeResult?.selectedBefore) !== Number(row.probeResult?.targetIndex)),\n        staleBeforeTargetCount: rows.filter(row => Number(row.probeResult?.selectedBefore) === Number(row.probeResult?.targetIndex)).length,\n      },\n    });\n",
        "causal group evidence",
    )
    text = replace_once(
        text,
        "    groups,\n    special: { slowP3P4: slow, reconnectP3P4: reconnect },\n",
        "    groups,\n    samples: all,\n    special: { slowP3P4: slow, reconnectP3P4: reconnect },\n",
        "raw samples evidence",
    )
    text = replace_once(
        text,
        "    expect(groups[0].turnToInteract.n).toBe(SAMPLE_COUNT);\n",
        "    expect(groups[0].turnToInteract.n).toBe(SAMPLE_COUNT);\n    expect(groups[0].causalSelection.n).toBe(SAMPLE_COUNT);\n    expect(groups[0].causalSelection.all).toBe(true);\n    expect(groups[0].causalSelection.staleBeforeTargetCount).toBe(0);\n",
        "causal assertions",
    )
    SPEC.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    patch_bridge()
    patch_spec()
    print("YAKOLAK_UX_TURN_32_CAUSAL_PROBE_PATCH_OK")
