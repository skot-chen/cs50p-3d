"""Build + check: runs every snippet in content/lectures.py with real Python and writes data/lectures.json.

Usage: python scripts/build.py      (exit code 1 if any snippet fails or the data is malformed)
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "content"))
from lectures import LECTURES, PLAYLIST  # noqa: E402

SCENES = {"machine", "gates", "bricks", "net", "shelf", "lamps", "pages", "regex", "blueprint", "conveyor"}
errors = []


def run(code, stdin=""):
    """Run code in an empty temp folder (files it writes vanish) and return stdout+stderr."""
    with tempfile.TemporaryDirectory() as d:
        p = subprocess.run(
            [sys.executable, "-I", "-X", "utf8", "-c", code],
            input=(stdin + "\n") if stdin else "",
            capture_output=True, text=True, encoding="utf-8", cwd=d, timeout=20,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
    return p.returncode, p.stdout + p.stderr


def main():
    chapters = json.loads((ROOT / "content" / "chapters.json").read_text(encoding="utf-8"))
    out = []
    seen = set()
    for lec in LECTURES:
        n = lec["n"]
        where = f"Lecture {n}"
        if n in seen:
            errors.append(f"{where}: duplicate number")
        seen.add(n)
        for key in ("title", "zh", "video", "scene", "hook", "hook_en", "scene_tip", "concepts", "quiz", "words"):
            if not lec.get(key):
                errors.append(f"{where}: missing {key}")
        if lec["scene"] not in SCENES:
            errors.append(f"{where}: unknown scene {lec['scene']}")
        if lec["video"] not in chapters:
            errors.append(f"{where}: no chapters for video {lec['video']}")
        concepts = []
        for c in lec["concepts"]:
            for key in ("term", "zh", "say", "en", "code"):
                if not c.get(key):
                    errors.append(f"{where} / {c.get('term')}: missing {key}")
            rc, output = run(c["code"], c.get("stdin", ""))
            if rc != 0:
                errors.append(f"{where} / {c['term']}: snippet crashed\n{output}")
            concepts.append({**c, "output": output})
        quiz = []
        for q in lec["quiz"]:
            rc, output = run(q["code"])
            if rc != 0 or not output.strip():
                errors.append(f"{where} quiz: crashed or empty\n{q['code']}\n{output}")
            quiz.append({**q, "answer": output})
        out.append({
            **{k: lec[k] for k in ("n", "title", "zh", "video", "scene", "hook", "hook_en", "scene_tip")},
            "chapters": chapters.get(lec["video"], []),
            "concepts": concepts,
            "quiz": quiz,
            "words": [{"en": e, "zh": z} for e, z in lec["words"]],
            "pset": f"https://cs50.harvard.edu/python/psets/{n}/",
        })
    if sorted(seen) != list(range(len(LECTURES))):
        errors.append(f"lecture numbers must be 0..{len(LECTURES) - 1}, got {sorted(seen)}")
    if errors:
        print("FAILED:\n" + "\n\n".join(errors))
        sys.exit(1)
    data = {"playlist": PLAYLIST, "lectures": out}
    (ROOT / "data" / "lectures.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    n_snip = sum(len(l["concepts"]) + len(l["quiz"]) for l in out)
    print(f"OK: {len(out)} lectures, {n_snip} snippets ran with Python {sys.version.split()[0]}")


if __name__ == "__main__":
    main()
