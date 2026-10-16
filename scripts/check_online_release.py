#!/usr/bin/env python3
"""Enforce the requested real-device acceptance before publishing multiplayer."""
import json
from pathlib import Path

record = json.loads((Path(__file__).resolve().parents[1] / "docs/online-acceptance.json").read_text())
scenarios = ("code_and_link", "names_and_seats", "moves_and_turn_validation", "round_and_rematch", "disconnect_and_rejoin", "host_exit")
accepted = (record.get("result") == "passed"
            and len(set(record.get("physicalDevices", []))) >= 2
            and all(isinstance(device, str) and device.strip() for device in record["physicalDevices"])
            and all(record.get("scenarios", {}).get(key) is True for key in scenarios))
publication = record.get("publication", {})
user_test = publication.get("authorized") is True and publication.get("purpose") == "user_device_test"
if not accepted and not user_test:
    raise SystemExit("Pages publish blocked: real multiplayer acceptance on two physical devices is still pending. See docs/ONLINE_TRYSTERO.md.")
if accepted:
    print("YAKOLAK_REAL_DEVICE_ACCEPTANCE_RECORDED")
else:
    print("YAKOLAK_OWNER_AUTHORIZED_DEVICE_TEST_PUBLISH: real-device acceptance remains pending")
