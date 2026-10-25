"""Replace reference part data in memory with the web catalog snapshot."""

import json
from pathlib import Path


def apply_product_catalog(module):
    path = Path(__file__).resolve().parent.parent / "src/data/catalog/catalog.snapshot.json"
    source = json.loads(path.read_text(encoding="utf-8"))["source"]
    catalogs = {
        "legs": module.legData,
        "bodies": module.bodyData,
        "weapons": module.weaponData,
        "accessories": module.accData,
    }
    for kind, parts in catalogs.items():
        snapshot_parts = {item["ID"]: item for item in source[kind]}
        if sorted(snapshot_parts) != sorted(item["ID"] for item in parts):
            raise ValueError(f"Catalog snapshot part IDs differ from reference: {kind}")
        for part in parts:
            snapshot_part = snapshot_parts[part["ID"]]
            if part["Name"] != snapshot_part["Name"]:
                raise ValueError(f"Catalog snapshot target mismatch: {kind}/{part['ID']}")
            part.update(snapshot_part)
