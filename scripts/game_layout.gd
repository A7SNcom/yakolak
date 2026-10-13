extends RefCounted

# One physical scale for the closed shell, intro stones, setup, colliders,
# placement and scores. The canonical SVG tabletop keeps its original size.
const UNIT: float = 0.0368
const REST_CLEARANCE: float = 0.55
const REST_CENTER: float = 135.0 * UNIT + REST_CLEARANCE
const TURN_CAMERA_SECONDS: float = 1.25
const TURN_TIMEOUT_MS: int = 30000
const COUNTDOWN_DELAY_MS: int = 10000
