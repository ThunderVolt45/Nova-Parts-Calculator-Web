#!/usr/bin/env python3
"""Generate browser-safe part-to-GX metadata from the verified unpacker map."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_UNPACKER = ROOT.parent / "Nova-1492-GX-Unpacker"
DEFAULT_CATALOG = ROOT / "src/data/catalog/catalog.snapshot.json"
DEFAULT_OUTPUT = ROOT / "src/gx/resource-map.generated.json"

CATEGORY_KEYS = {
    "leg": "legs",
    "body": "bodies",
    "weapon": "weapons",
    "accessory": "accessories",
}


def load_module(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("nova_export_parts_glb", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load mapping module: {path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def git_revision(repository: Path) -> str:
    return subprocess.check_output(
        ["git", "-C", str(repository), "rev-parse", "HEAD"],
        text=True,
        encoding="utf-8",
    ).strip()


def generate(unpacker: Path, catalog_path: Path) -> dict[str, Any]:
    mapping_script = unpacker / "tools/export_parts_glb.py"
    mapping_module = load_module(mapping_script)
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    revision = git_revision(unpacker)
    items: list[dict[str, Any]] = []

    for kind, catalog_key in CATEGORY_KEYS.items():
        matches = mapping_module.CATEGORIES[kind][1]
        for row in catalog["source"][catalog_key]:
            part_id = int(row["ID"])
            if part_id == 0:
                continue

            name = str(row["Name"])
            match = matches.get(name)
            if match is None:
                item = {
                    "kind": kind,
                    "partId": part_id,
                    "partName": name,
                    "mappingStatus": "unresolved",
                    "sourceGx": None,
                    "confidence": "unresolved",
                    "evidence": None,
                    "note": "Name has no entry in the maintained mapping table.",
                }
            else:
                item = {
                    "kind": kind,
                    "partId": part_id,
                    "partName": name,
                    "mappingStatus": "mapped" if match.gx else "unresolved",
                    "sourceGx": match.gx,
                    "confidence": match.confidence,
                    "evidence": match.evidence,
                    "note": match.note,
                }
            items.append(item)

    return {
        "mappingVersion": f"1-{revision[:12]}",
        "sourceRevision": revision,
        "catalogVersion": catalog["catalogVersion"],
        "items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unpacker", type=Path, default=DEFAULT_UNPACKER)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    result = generate(args.unpacker.resolve(), args.catalog.resolve())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(result['items'])} mappings to {args.out}")


if __name__ == "__main__":
    main()
