"""Apply web catalog corrections to reference data in memory only."""

import json
from pathlib import Path


def apply_product_catalog_corrections(module):
    path = Path(__file__).resolve().parent.parent / "src/data/catalog/catalog.overrides.json"
    overrides = json.loads(path.read_text(encoding="utf-8"))
    catalogs = {
        "legs": module.legData,
        "bodies": module.bodyData,
        "weapons": module.weaponData,
        "accessories": module.accData,
    }
    for change in overrides["corrections"] + overrides["changes"]:
        part = next(item for item in catalogs[change["kind"]] if item["ID"] == change["id"])
        if part["Name"] != change["name"]:
            raise ValueError(f"Catalog override target mismatch: {change['name']}")
        part.update(change["values"])
