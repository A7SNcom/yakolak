#!/usr/bin/env python3
"""Read-only validation of the preparation package, never of store compliance.

Uses Python's standard library. It does not build, install, publish, use the
network, execute the game, modify the repository, or mark evidence as passed.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit, unquote


PACKAGE = Path(__file__).resolve().parent
ROOT = PACKAGE.parents[2]
ERRORS: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        ERRORS.append(message)


def read_json(relative: str) -> dict:
    with (PACKAGE / relative).open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"{relative}: root must be an object")
    return value


def validate() -> None:
    plan = read_json("launch-plan.json")
    acceptance = read_json("acceptance-template.json")
    ledger = read_json("sources.json")
    evidence = read_json("code-evidence.json")
    listing = read_json("templates/store-listing.json")

    for name, value in (
        ("plan", plan), ("acceptance", acceptance), ("sources", ledger),
        ("code evidence", evidence), ("store listing", listing),
    ):
        check(value.get("schema_version") == 1, f"{name}: unknown schema")

    check(plan.get("artifact_type") == "execution_preparation_only", "Not a preparation plan")
    check(plan.get("runtime_changed_by_this_package") is False, "Unexpected runtime-change claim")
    check(plan.get("ready_for_store_submission") is False, "Plan must not assert store readiness")
    check(acceptance.get("ready_for_submission") is False, "Template must not assert readiness")
    check(listing.get("verified_on_release_build") is False, "Draft listing is not release-verified")

    baseline = plan["baseline_commit"]
    check(bool(re.fullmatch(r"[a-f0-9]{40}", baseline)), "Invalid baseline SHA")
    check(acceptance.get("baseline_commit") == baseline, "Acceptance baseline differs")
    check(evidence.get("baseline_commit") == baseline, "Code evidence baseline differs")

    source_ids = [item["id"] for item in ledger["sources"]]
    source_set = set(source_ids)
    check(len(source_ids) == len(source_set), "Duplicate source ID")
    for source in ledger["sources"]:
        check(bool(re.fullmatch(r"[SC]\d{2}", source["id"])), "Invalid source ID")
        parsed = urlsplit(source["url"])
        check(parsed.scheme == "https" and bool(parsed.netloc), f"{source['id']}: invalid URL")
        check(source.get("checked_on") == ledger["as_of"], f"{source['id']}: missing checked date")
        check(bool(source.get("access")), f"{source['id']}: access limitation not stated")

    tasks = plan["tasks"]
    task_ids = [task["id"] for task in tasks]
    task_set = set(task_ids)
    check(len(task_ids) == len(task_set), "Duplicate task ID")
    gates = {gate["id"] for gate in acceptance["gates"]}
    edges: dict[str, set[str]] = {}
    for task in tasks:
        task_id = task["id"]
        check(bool(re.fullmatch(r"YKL-\d{3}", task_id)), f"Invalid task ID: {task_id}")
        check(task["status"] == "planned", f"{task_id}: preparation snapshot must remain planned")
        check(task["priority"] in {"P0", "P1", "P2"}, f"{task_id}: invalid priority")
        check(task["gate"] in gates, f"{task_id}: unknown gate")
        check(task["route"] in {"both", "wrapper", "native"}, f"{task_id}: invalid route")
        check(bool(task["steps_ar"]) and bool(task["acceptance_ar"]), f"{task_id}: empty contract")
        effort = task["effort_person_days"]
        check(0 <= effort["min"] <= effort["max"], f"{task_id}: invalid estimate")
        refs = set(task.get("source_refs", []))
        check(refs <= source_set, f"{task_id}: missing sources {refs - source_set}")
        dependencies = set(task.get("depends_on", []))
        for alternatives in task.get("requires_one_of", []):
            check(bool(alternatives), f"{task_id}: empty alternative dependency group")
            dependencies.update(alternatives)
        for dependency in task.get("conditional_dependencies", []):
            dependencies.update(dependency["ids"])
        check(dependencies <= task_set, f"{task_id}: unknown dependencies {dependencies - task_set}")
        check(task_id not in dependencies, f"{task_id}: depends on itself")
        edges[task_id] = dependencies
        for relative in task["existing_target_paths"]:
            check((ROOT / relative).exists(), f"{task_id}: missing existing target {relative}")

    visited: set[str] = set()
    active: set[str] = set()

    def visit(task_id: str) -> None:
        if task_id in active:
            ERRORS.append(f"Task dependency cycle at {task_id}")
            return
        if task_id in visited or task_id not in edges:
            return
        active.add(task_id)
        for dependency in edges[task_id]:
            visit(dependency)
        active.remove(task_id)
        visited.add(task_id)

    for task_id in task_ids:
        visit(task_id)

    scenarios = acceptance["scenarios"]
    scenario_ids = [scenario["id"] for scenario in scenarios]
    check(len(scenario_ids) == len(set(scenario_ids)), "Duplicate scenario ID")
    for scenario in scenarios:
        sid = scenario["id"]
        check(bool(re.fullmatch(r"T\d{2}", sid)), f"Invalid scenario ID: {sid}")
        check(scenario["result"] == "not_run", f"{sid}: preparation template must remain not_run")
        check(not scenario["evidence"], f"{sid}: unexpected executed evidence in template")
        check(set(scenario["task_ids"]) <= task_set, f"{sid}: unknown task IDs")
        check(bool(scenario["expected_ar"]), f"{sid}: missing expected result")
    check(all(gate["result"] == "not_run" for gate in acceptance["gates"]), "Unexpected passed gate")
    check(not acceptance["physical_devices"], "Template must not invent tested devices")
    check(not acceptance["release_candidates"], "Template must not invent release binaries")

    # Confirm evidence against historical git blobs, not the changed root README.
    # subprocess arguments are structured; no shell or untrusted interpolation.
    for record in evidence["files"]:
        relative = record["path"]
        blob = subprocess.run(
            ["git", "show", f"{baseline}:{relative}"], cwd=ROOT,
            capture_output=True, check=False,
        )
        check(blob.returncode == 0, f"Missing baseline blob: {relative}")
        if blob.returncode == 0:
            check(hashlib.sha256(blob.stdout).hexdigest() == record["sha256"],
                  f"Baseline checksum mismatch: {relative}")
            check(len(blob.stdout) == record["bytes"], f"Baseline size mismatch: {relative}")

    for path in PACKAGE.rglob("*.md"):
        body = path.read_text(encoding="utf-8")
        refs = set(re.findall(r"\b[SC]\d{2}\b", body))
        check(refs <= source_set, f"{path.name}: unresolved source IDs {refs - source_set}")
        for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)\s]+)\)", body):
            if urlsplit(target).scheme or target.startswith("#"):
                continue
            local = unquote(target.split("#", 1)[0])
            check((path.parent / local).exists(), f"{path.name}: broken local link {target}")
        check(body.count("```") % 2 == 0, f"{path.name}: unbalanced fenced block")

    for variant in ("offline_local_bots",):
        for locale in ("ar", "en"):
            text = listing["variants"][variant][locale]
            check(len(text["name"]) <= 30, f"{locale}: app name exceeds 30 characters")
            check(len(text["apple_subtitle"]) <= 30, f"{locale}: subtitle exceeds 30 characters")
            check(len(text["google_short_description"]) <= 80, f"{locale}: short description exceeds 80")
            check(len(text["full_description"]) <= 4000, f"{locale}: description exceeds 4000")

    if ERRORS:
        print("Preparation validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        raise SystemExit(1)
    print(f"Preparation package valid: {len(tasks)} tasks, {len(scenarios)} scenarios, "
          f"{len(source_ids)} sources, {len(evidence['files'])} baseline file checksums.")
    print("Validated: JSON contracts, dependency graph, local links, source references, "
          "draft text limits and historical source checksums.")
    print("Mobile runtime, physical-device acceptance and store approval are NOT verified.")


if __name__ == "__main__":
    try:
        validate()
    except (KeyError, ValueError, OSError) as exc:
        print(f"Invalid preparation package: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
