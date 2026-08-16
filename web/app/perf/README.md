# THREEJS-017 executable performance guardrails

The canonical narrative baseline and release limits live in `../../../THREEJS_PERFORMANCE_BUDGETS.md`. Executable ceilings live in `performance-budgets.js`, startup marks in `startup-marks.js`, and the throttled Chromium probe in `../../../scripts/measure-threejs-performance.mjs`.

This file is intentionally not imported by the application. Keeping the pointer under `web/app/perf/` means changes to the executable performance contract remain inside the existing Three.js browser-verification path filter without adding bytes or requests to startup.
