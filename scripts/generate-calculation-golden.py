import argparse
import importlib
import json
import random
import subprocess
import sys
from pathlib import Path


RANDOM_SEED = 1492
RANDOM_CASES_PER_MODE = 256


def parse_args():
    script_directory = Path(__file__).resolve().parent
    web_root = script_directory.parent
    default_reference = web_root.parent / "Nova-Parts-Calculator-Python"
    default_output = (
        web_root
        / "src"
        / "domain"
        / "calculation"
        / "fixtures"
        / "base-calculation.golden.json"
    )

    parser = argparse.ArgumentParser()
    parser.add_argument("reference_root", nargs="?", type=Path, default=default_reference)
    parser.add_argument("--output", type=Path, default=default_output)
    return parser.parse_args()


def run_git(reference_root, *args):
    return subprocess.run(
        ["git", "-C", str(reference_root), *args],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def load_reference_modules(reference_root):
    sys.path.insert(0, str(reference_root))
    return importlib.import_module("assemble")


def part_reinforcement(watt=0, health=0, damage=0):
    return {"watt": watt, "health": health, "damage": damage}


def make_input(
    part_ids,
    subcore_ids=(0, 0, 0),
    reinforcement=None,
    accessory_options=(0, 0, 0),
    calculate_as_float=False,
):
    reinforcement = reinforcement or (
        part_reinforcement(),
        part_reinforcement(),
        part_reinforcement(),
    )
    return {
        "partIds": {
            "leg": part_ids[0],
            "body": part_ids[1],
            "weapon": part_ids[2],
            "accessory": part_ids[3],
        },
        "subcoreIds": {
            "leg": subcore_ids[0],
            "body": subcore_ids[1],
            "weapon": subcore_ids[2],
        },
        "reinforcement": {
            "leg": reinforcement[0],
            "body": reinforcement[1],
            "weapon": reinforcement[2],
        },
        "accessoryRandomOptions": {
            "health": accessory_options[0],
            "damage": accessory_options[1],
            "armor": accessory_options[2],
        },
        "calculateAsFloat": calculate_as_float,
    }


def build_curated_inputs(assemble):
    leg_data = assemble.legData
    body_data = assemble.bodyData
    weapon_data = assemble.weaponData
    accessory_data = assemble.accData

    max_speed_leg = max(leg_data, key=lambda item: item["Speed"])["ID"]
    max_sight_body = max(body_data, key=lambda item: item["Sight"])["ID"]
    max_range_weapon = max(weapon_data, key=lambda item: item["Range"])["ID"]
    max_speed_accessory = max(accessory_data, key=lambda item: item["Speed"])["ID"]
    min_armor_leg = min(leg_data, key=lambda item: item["Armor"])["ID"]
    min_regen_body = min(body_data, key=lambda item: item["Regenerate"])["ID"]
    min_speed_weapon = min(weapon_data, key=lambda item: item["Speed"])["ID"]
    min_health_accessory = min(accessory_data, key=lambda item: item["Health"])["ID"]
    random_accessory = next(
        item["ID"] for item in accessory_data if item["HasRandomOption"]
    )

    maximum_reinforcement = (
        part_reinforcement(100, 100, 100),
        part_reinforcement(100, 100, 100),
        part_reinforcement(100, 100, 100),
    )

    templates = [
        (
            "empty",
            make_input((0, 0, 0, 0)),
        ),
        (
            "basic",
            make_input(
                (1, 1, 1, 1),
                reinforcement=(
                    part_reinforcement(17, 33, 49),
                    part_reinforcement(65, 81, 97),
                    part_reinforcement(13, 29, 45),
                ),
            ),
        ),
        (
            "maximum-reinforcement",
            make_input((40, 58, 64, 77), reinforcement=maximum_reinforcement),
        ),
        (
            "caps-and-maximum-range",
            make_input(
                (
                    max_speed_leg,
                    max_sight_body,
                    max_range_weapon,
                    max_speed_accessory,
                ),
                (12, 10, 9),
            ),
        ),
        (
            "negative-modifiers-and-floors",
            make_input(
                (
                    min_armor_leg,
                    min_regen_body,
                    min_speed_weapon,
                    min_health_accessory,
                ),
                (5, 5, 5),
            ),
        ),
        (
            "random-accessory-options",
            make_input(
                (10, 20, 30, random_accessory),
                (3, 7, 11),
                maximum_reinforcement,
                (200, 20, 10),
            ),
        ),
        (
            "sagittarius-slot-overrides",
            make_input((5, 5, 5, 5), (9, 9, 9)),
        ),
    ]

    inputs = []
    for name, integer_input in templates:
        inputs.append((f"curated-integer-{name}", integer_input))
        float_input = json.loads(json.dumps(integer_input))
        float_input["calculateAsFloat"] = True
        inputs.append((f"curated-float-{name}", float_input))
    return inputs


def build_random_inputs(assemble):
    rng = random.Random(RANDOM_SEED)
    part_id_sets = [
        [item["ID"] for item in assemble.legData],
        [item["ID"] for item in assemble.bodyData],
        [item["ID"] for item in assemble.weaponData],
        [item["ID"] for item in assemble.accData],
    ]
    subcore_ids = assemble.subCoreData["ID"]
    inputs = []

    for calculate_as_float in (False, True):
        mode = "float" if calculate_as_float else "integer"
        for case_index in range(RANDOM_CASES_PER_MODE):
            reinforcement = tuple(
                part_reinforcement(
                    rng.randint(0, 100),
                    rng.randint(0, 100),
                    rng.randint(0, 100),
                )
                for _ in range(3)
            )
            input_value = make_input(
                tuple(rng.choice(ids) for ids in part_id_sets),
                tuple(rng.choice(subcore_ids) for _ in range(3)),
                reinforcement,
                (rng.randint(0, 200), rng.randint(0, 20), rng.randint(0, 10)),
                calculate_as_float,
            )
            inputs.append((f"random-{mode}-{case_index:03d}", input_value))

    return inputs


def evaluate(assemble, input_value):
    part_ids = input_value["partIds"]
    subcore_ids = input_value["subcoreIds"]
    reinforcement = input_value["reinforcement"]
    accessory_options = input_value["accessoryRandomOptions"]
    calculate_as_float = input_value["calculateAsFloat"]

    part_indexes_by_id = [
        {item["ID"]: index for index, item in enumerate(assemble.legData)},
        {item["ID"]: index for index, item in enumerate(assemble.bodyData)},
        {item["ID"]: index for index, item in enumerate(assemble.weaponData)},
        {item["ID"]: index for index, item in enumerate(assemble.accData)},
    ]
    subcore_indexes_by_id = {
        item_id: index for index, item_id in enumerate(assemble.subCoreData["ID"])
    }
    parts_index = (
        part_indexes_by_id[0][part_ids["leg"]],
        part_indexes_by_id[1][part_ids["body"]],
        part_indexes_by_id[2][part_ids["weapon"]],
        part_indexes_by_id[3][part_ids["accessory"]],
    )
    subcore_index = (
        subcore_indexes_by_id[subcore_ids["leg"]],
        subcore_indexes_by_id[subcore_ids["body"]],
        subcore_indexes_by_id[subcore_ids["weapon"]],
    )
    watt_reinforcement = tuple(
        reinforcement[slot]["watt"] for slot in ("leg", "body", "weapon")
    )
    health_reinforcement = tuple(
        reinforcement[slot]["health"] for slot in ("leg", "body", "weapon")
    )
    damage_reinforcement = tuple(
        reinforcement[slot]["damage"] for slot in ("leg", "body", "weapon")
    )
    leg = assemble.legData[parts_index[0]]
    weapon = assemble.weaponData[parts_index[2]]

    return {
        "usedWeight": assemble.GetWeight(parts_index),
        "loadCapacity": leg["Weight"],
        "watt": assemble.GetWatt(
            parts_index,
            subcore_index,
            watt_reinforcement,
            calculate_as_float,
        ),
        "health": assemble.GetHealth(
            parts_index,
            subcore_index,
            health_reinforcement,
            accessory_options["health"],
            calculate_as_float,
        ),
        "regenerationPercent": assemble.GetRegenerate(parts_index, subcore_index),
        "speed": assemble.GetSpeed(parts_index, subcore_index),
        "cooldown": assemble.GetCooldown(parts_index, subcore_index),
        "range": assemble.GetRange(parts_index, subcore_index),
        "minimumRange": weapon["RangeMinimum"],
        "splashRadius": assemble.GetSplash(parts_index, subcore_index),
        "sight": assemble.GetSight(parts_index, subcore_index),
        "damage": assemble.GetDamage(
            parts_index,
            subcore_index,
            damage_reinforcement,
            accessory_options["damage"],
            calculate_as_float,
        ),
        "damagePerHealthPercent": assemble.GetDamagePerHealth(
            parts_index, subcore_index
        ),
        "armorPierce": assemble.GetPierce(parts_index, subcore_index),
        "armor": assemble.GetArmor(
            parts_index, subcore_index, accessory_options["armor"]
        ),
        "attackTargets": {
            "ground": weapon["CanAttackGround"],
            "air": weapon["CanAttackAir"],
        },
    }


def main():
    args = parse_args()
    reference_root = args.reference_root.resolve()
    web_root = Path(__file__).resolve().parent.parent
    catalog_snapshot_path = (
        web_root / "src" / "data" / "catalog" / "catalog.snapshot.json"
    )
    snapshot = json.loads(catalog_snapshot_path.read_text(encoding="utf-8"))

    dirty_catalog = run_git(reference_root, "status", "--porcelain", "--", "JSON")
    if dirty_catalog:
        raise RuntimeError(
            "Reference catalog has uncommitted changes; golden data would not be reproducible."
        )

    source_revision = run_git(reference_root, "rev-parse", "HEAD")
    if source_revision != snapshot["sourceRevision"]:
        raise RuntimeError(
            "Reference revision differs from catalog.snapshot.json. "
            "Run npm run catalog:import first."
        )

    assemble = load_reference_modules(reference_root)
    input_cases = build_curated_inputs(assemble) + build_random_inputs(assemble)
    cases = [
        {
            "name": name,
            "input": input_value,
            "expected": evaluate(assemble, input_value),
        }
        for name, input_value in input_cases
    ]
    output = {
        "catalogVersion": snapshot["catalogVersion"],
        "sourceRevision": source_revision,
        "randomSeed": RANDOM_SEED,
        "randomCasesPerMode": RANDOM_CASES_PER_MODE,
        "cases": cases,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Generated {len(cases)} calculation cases at {args.output.resolve()}")


if __name__ == "__main__":
    main()
