// Yakolak golden calibration archive
// Archived: 2026-06-21
// Status: golden_do_not_edit_without_new_test
// Note: هذه هي المعايرة الممتازة التي وصلنا لها. تحفظ كمرجع ذهبي.

const YAKOLAK_ALIGNMENT = {
  "name": "YAKOLAK_GOLDEN_ALIGNMENT",
  "version": "v030-board-nine-stones",
  "approved_9_and_3": {
    "9": { "px": 0, "py": 6, "pz": 0, "rx": -90, "ry": 0, "rz": 0 },
    "3-right": { "px": 135, "py": 6, "pz": 0, "rx": -90, "ry": 0, "rz": 0 },
    "3-left": { "px": -135, "py": 6, "pz": 0, "rx": -90, "ry": 0, "rz": 180 },
    "3-front": { "px": 0, "py": 6, "pz": 135, "rx": -90, "ry": 0, "rz": 90 },
    "3-back": { "px": 0, "py": 6, "pz": -135, "rx": -90, "ry": 0, "rz": -90 }
  },
  "stone_setup": {
    "board_grid": "3x3",
    "distance": 48,
    "mainDirectionDeg": 0,
    "sideDirectionDeg": 90,
    "board_stone_sets": 9,
    "outer_base_count": 4,
    "copies_per_outer_base": 3,
    "outer_stone_sets": 12,
    "total_stone_sets": 21,
    "rule": "نفس التباعد 48 يطبق على خانات البورد 3x3 وعلى أماكن الاستعداد الخارجية. لا تعاير كل حجر لوحده."
  },
  "LMS": {
    "px": 0,
    "py": 2,
    "pz": 0,
    "rx": -90,
    "ry": 0,
    "rz": 0,
    "height_label_ar": "ارتفاع كل الحجار"
  }
};
