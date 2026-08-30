# Historical PAGES-014 Deployment Generation Contract

Status: **RETIRED / HISTORICAL / READ-ONLY**.

This document records the former GitHub Pages generation scheme that combined a Godot `[flash-ready]` root with a `threejs-rebuild` candidate and a Three.js runtime-config hash. That scheme is no longer an active deployment, qualification, rollback, or fallback path.

The only current operational path is:

`GitHub main` → `YAKOLAK Flash Publish` → Godot Web export → `[flash-ready]` → Vercel → https://yakolak.vercel.app/

Do not execute or restore the old PAGES-014/PAGES-015/Three.js workflows from this document. Their full implementation and evidence remain available in Git history for historical inspection only.
