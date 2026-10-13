#!/usr/bin/env python3
"""Run the real intro/setup regression using only the exported pack.

Running --main-pack from the source project hides missing resources because
Godot can load them from disk. The isolated directory contains only the test
runner; every res:// game resource must therefore come from the shipping pack.
"""

from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def main() -> int:
    godot = Path(sys.argv[1]).resolve()
    pack = Path(sys.argv[2]).resolve()
    runner = Path(__file__).resolve().parent.parent / "tests/visual_setup_scene_headless.gd"
    with tempfile.TemporaryDirectory(prefix=".pack-check-", dir=pack.parent) as directory:
        isolated = Path(directory)
        test = isolated / "smoke.gd"
        shutil.copyfile(runner, test)
        try:
            result = subprocess.run(
                [str(godot), "--headless", "--path", str(isolated),
                 "--main-pack", str(pack), "--script", str(test)],
                cwd=isolated, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, timeout=90, check=False,
            )
        except subprocess.TimeoutExpired as error:
            print(error.stdout.decode() if isinstance(error.stdout, bytes) else error.stdout or "")
            print("YAKOLAK_EXPORTED_PACK_FAILED timeout", file=sys.stderr)
            return 1
    print(result.stdout, end="")
    if result.returncode or re.search(r"(?m)^(?:SCRIPT )?ERROR:", result.stdout):
        print("YAKOLAK_EXPORTED_PACK_FAILED runtime-error", file=sys.stderr)
        return 1
    if "YAKOLAK_VISUAL_SCENE_OK intro_to_setup_to_match_to_setup" not in result.stdout:
        print("YAKOLAK_EXPORTED_PACK_FAILED missing-completion", file=sys.stderr)
        return 1
    print("YAKOLAK_EXPORTED_PACK_OK isolated=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
