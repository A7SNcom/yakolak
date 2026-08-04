# Generated Room Asset

Build a neutral enclosed room from six surfaces; no imported room mesh is required.

- X extent: -2400 to 2400.
- Y extent: floor -650 to ceiling 1250.
- Z extent: back -2400 to front 2400.
- Back, left, right, and ceiling: near-white matte.
- Floor: `#deddd7`, matte.
- Front surface may be hidden or transparent so the camera can view inward.
- Place the table at world center with top Y at -16.
- Align the game assembly to the measured table top plus 0.8 clearance.
- Wall content is placed near Z -2386 or X 2386, slightly in front of the physical wall to prevent z-fighting.
- Keep the camera and target inside the room bounds.

Use `room-plan.svg` only as a top-view guide; `WORLD.md` contains the authoritative camera and game coordinates.
