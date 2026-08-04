import argparse
import importlib
import json
import os
import random
import re
import subprocess
import sys
from pathlib import Path


RANDOM_SEED = 1492_05
RANDOM_CASES = 256


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
        / "final-calculation.golden.json"
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


def load_calculator(reference_root):
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    sys.path.insert(0, str(reference_root))
    calculator = importlib.import_module("calculator")
    qt_widgets = importlib.import_module("PyQt6.QtWidgets")
    application = qt_widgets.QApplication.instance() or qt_widgets.QApplication([])
    return calculator, application, calculator.WindowClass()


def part_reinforcement(watt=0, health=0, damage=0):
    return {"watt": watt, "health": health, "damage": damage}


def make_base_input(
    part_ids,
    subcore_ids=(0, 0, 0),
    reinforcement=None,
    accessory_options=(0, 0, 0),
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
        "calculateAsFloat": False,
    }


def make_simulation(**overrides):
    simulation = {
        "statuses": {
            "bodyLowHealthEffect": False,
            "weaponEffect": False,
            "towering": False,
            "deathmatch": False,
        },
        "skills": {
            "attackBase": False,
            "defenseBase": False,
            "teamDualPlayers": 0,
            "groundAirAttack": False,
            "groundAirSpeed": False,
            "groundAirCooldown": False,
            "despera": False,
            "devilSpirit": False,
            "groundAirDefense": False,
            "groundAirSight": False,
            "morale": False,
            "teamAttackPlayers": 0,
            "teamDefensePlayers": 0,
            "sacrifyWatt": 0,
        },
        "squareFormation": {
            "damageUnits": 0,
            "speedUnits": 0,
            "cooldownUnits": 0,
        },
    }
    for section, values in overrides.items():
        simulation[section].update(values)
    return simulation


def make_case(name, part_ids, simulation=None, **base_overrides):
    return {
        "name": name,
        "baseInput": make_base_input(part_ids, **base_overrides),
        "simulation": simulation or make_simulation(),
    }


def build_curated_cases():
    all_skills = make_simulation(
        statuses={
            "bodyLowHealthEffect": True,
            "weaponEffect": True,
            "towering": True,
            "deathmatch": True,
        },
        skills={
            "attackBase": True,
            "defenseBase": True,
            "teamDualPlayers": 12,
            "groundAirAttack": True,
            "groundAirSpeed": True,
            "groundAirCooldown": True,
            "despera": True,
            "devilSpirit": True,
            "groundAirDefense": True,
            "groundAirSight": True,
            "morale": True,
            "teamAttackPlayers": 12,
            "teamDefensePlayers": 12,
            "sacrifyWatt": 2500,
        },
        squareFormation={
            "damageUnits": 50,
            "speedUnits": 50,
            "cooldownUnits": 50,
        },
    )
    enabled_body_effect = make_simulation(
        statuses={"bodyLowHealthEffect": True}
    )
    enabled_weapon_effect = make_simulation(statuses={"weaponEffect": True})
    enabled_towering = make_simulation(statuses={"towering": True})

    return [
        make_case("empty", (0, 0, 0, 0)),
        make_case("basic-no-simulation", (10, 10, 10, 10)),
        make_case("no-attack-all-simulation", (10, 10, 0, 28), all_skills),
        make_case("body-low-health-armor", (10, 38, 10, 0), enabled_body_effect),
        make_case("body-low-health-damage", (10, 47, 10, 0), enabled_body_effect),
        make_case("weapon-speed-effect", (10, 10, 33, 0), enabled_weapon_effect),
        make_case("weapon-armor-effect", (10, 10, 44, 0), enabled_weapon_effect),
        make_case("weapon-damage-50-effect", (10, 10, 45, 0), enabled_weapon_effect),
        make_case("weapon-damage-30-effect", (10, 10, 46, 0), enabled_weapon_effect),
        make_case(
            "weapon-divide-after-body-bonus",
            (10, 47, 47, 0),
            make_simulation(
                statuses={"bodyLowHealthEffect": True, "weaponEffect": True}
            ),
        ),
        make_case("standard-towering", (10, 10, 10, 28), enabled_towering),
        make_case("enhanced-towering", (10, 10, 10, 19), enabled_towering),
        make_case(
            "enhanced-random-towering",
            (10, 10, 10, 60),
            enabled_towering,
            accessory_options=(200, 20, 10),
        ),
        make_case("heal-15-percent", (10, 10, 48, 0), make_simulation(statuses={"deathmatch": True})),
        make_case("heal-30-percent", (10, 10, 54, 0)),
        make_case("all-skills-and-statuses", (40, 47, 45, 60), all_skills, subcore_ids=(1, 5, 9)),
        make_case(
            "caps-and-floors",
            (1, 1, 33, 19),
            make_simulation(
                statuses={"weaponEffect": True, "towering": True},
                skills={
                    "groundAirSpeed": True,
                    "groundAirCooldown": True,
                    "groundAirSight": True,
                },
                squareFormation={"speedUnits": 50, "cooldownUnits": 50},
            ),
        ),
        make_case(
            "maximum-reinforcement",
            (40, 58, 64, 77),
            reinforcement=(
                part_reinforcement(100, 100, 100),
                part_reinforcement(100, 100, 100),
                part_reinforcement(100, 100, 100),
            ),
        ),
    ]


def random_simulation(rng):
    return make_simulation(
        statuses={
            "bodyLowHealthEffect": rng.choice((False, True)),
            "weaponEffect": rng.choice((False, True)),
            "towering": rng.choice((False, True)),
            "deathmatch": rng.choice((False, True)),
        },
        skills={
            "attackBase": rng.choice((False, True)),
            "defenseBase": rng.choice((False, True)),
            "teamDualPlayers": rng.randint(0, 12),
            "groundAirAttack": rng.choice((False, True)),
            "groundAirSpeed": rng.choice((False, True)),
            "groundAirCooldown": rng.choice((False, True)),
            "despera": rng.choice((False, True)),
            "devilSpirit": rng.choice((False, True)),
            "groundAirDefense": rng.choice((False, True)),
            "groundAirSight": rng.choice((False, True)),
            "morale": rng.choice((False, True)),
            "teamAttackPlayers": rng.randint(0, 12),
            "teamDefensePlayers": rng.randint(0, 12),
            "sacrifyWatt": rng.randint(0, 2500),
        },
        squareFormation={
            "damageUnits": rng.randint(0, 50),
            "speedUnits": rng.randint(0, 50),
            "cooldownUnits": rng.randint(0, 50),
        },
    )


def build_random_cases(calculator):
    rng = random.Random(RANDOM_SEED)
    part_id_sets = [
        [item["ID"] for item in calculator.legData],
        [item["ID"] for item in calculator.bodyData],
        [item["ID"] for item in calculator.weaponData],
        [item["ID"] for item in calculator.accData],
    ]
    subcore_ids = calculator.subCoreData["ID"]
    cases = []

    for index in range(RANDOM_CASES):
        reinforcement = tuple(
            part_reinforcement(
                rng.randint(0, 100),
                rng.randint(0, 100),
                rng.randint(0, 100),
            )
            for _ in range(3)
        )
        cases.append(
            {
                "name": f"random-final-{index:03d}",
                "baseInput": make_base_input(
                    tuple(rng.choice(ids) for ids in part_id_sets),
                    tuple(rng.choice(subcore_ids) for _ in range(3)),
                    reinforcement,
                    (rng.randint(0, 200), rng.randint(0, 20), rng.randint(0, 10)),
                ),
                "simulation": random_simulation(rng),
            }
        )
    return cases


def set_checkbox(window, name, value):
    getattr(window, name).setChecked(value)


def set_text(window, name, value):
    getattr(window, name).setText(str(value))


def evaluate(calculator, window, case):
    base_input = case["baseInput"]
    simulation = case["simulation"]
    part_ids = base_input["partIds"]
    subcore_ids = base_input["subcoreIds"]
    reinforcement = base_input["reinforcement"]
    accessory_options = base_input["accessoryRandomOptions"]

    index_sets = [
        {item["ID"]: index for index, item in enumerate(calculator.legData)},
        {item["ID"]: index for index, item in enumerate(calculator.bodyData)},
        {item["ID"]: index for index, item in enumerate(calculator.weaponData)},
        {item["ID"]: index for index, item in enumerate(calculator.accData)},
    ]
    subcore_indexes = {
        item_id: index for index, item_id in enumerate(calculator.subCoreData["ID"])
    }
    calculator.legIndex = index_sets[0][part_ids["leg"]]
    calculator.bodyIndex = index_sets[1][part_ids["body"]]
    calculator.weaponIndex = index_sets[2][part_ids["weapon"]]
    calculator.accIndex = index_sets[3][part_ids["accessory"]]

    window.Leg_Subcore.setCurrentIndex(subcore_indexes[subcore_ids["leg"]])
    window.Body_Subcore.setCurrentIndex(subcore_indexes[subcore_ids["body"]])
    window.Weapon_Subcore.setCurrentIndex(subcore_indexes[subcore_ids["weapon"]])

    for prefix, slot in (("Leg", "leg"), ("Body", "body"), ("Weapon", "weapon")):
        set_text(window, f"{prefix}_wattReinforce", reinforcement[slot]["watt"])
        set_text(window, f"{prefix}_healthReinforce", reinforcement[slot]["health"])
        set_text(window, f"{prefix}_damageReinforce", reinforcement[slot]["damage"])
    set_text(window, "Acc_healthReinforce", accessory_options["health"])
    set_text(window, "Acc_damageReinforce", accessory_options["damage"])
    set_text(window, "Acc_armorReinforce", accessory_options["armor"])

    status_widgets = {
        "bodyLowHealthEffect": "Status_BodyLowHealth",
        "weaponEffect": "Status_WeaponEffect",
        "towering": "Status_Towering",
        "deathmatch": "Status_Deathmatch",
    }
    skill_checkbox_widgets = {
        "attackBase": "Skill_Attackbase",
        "defenseBase": "Skill_Defensebase",
        "groundAirAttack": "Skill_GAAttack",
        "groundAirSpeed": "Skill_GASpeed",
        "groundAirCooldown": "Skill_GADelay",
        "despera": "Skill_Despera",
        "devilSpirit": "Skill_Devilspirit",
        "groundAirDefense": "Skill_GADefense",
        "groundAirSight": "Skill_GASight",
        "morale": "Skill_Moral",
    }
    for key, widget in status_widgets.items():
        set_checkbox(window, widget, simulation["statuses"][key])
    for key, widget in skill_checkbox_widgets.items():
        set_checkbox(window, widget, simulation["skills"][key])

    set_text(window, "Skill_TeamdualPlayer", simulation["skills"]["teamDualPlayers"])
    set_text(window, "Skill_TeamattackPlayer", simulation["skills"]["teamAttackPlayers"])
    set_text(window, "Skill_TeamdefensePlayer", simulation["skills"]["teamDefensePlayers"])
    set_text(window, "Skill_SacrifyWatt", simulation["skills"]["sacrifyWatt"])
    set_text(window, "Status_SquareDamage", simulation["squareFormation"]["damageUnits"])
    set_text(window, "Status_SquareSpeed", simulation["squareFormation"]["speedUnits"])
    set_text(window, "Status_SquareCooldown", simulation["squareFormation"]["cooldownUnits"])

    window.Assemble()

    damage_text = window.Assemble_totaldamage.text()
    range_text = window.Assemble_totalrange.text()
    range_values = [int(value) for value in re.findall(r"\d+", range_text)]
    return {
        "health": int(window.Assemble_totalhealth.text()),
        "damage": int(damage_text) if damage_text.isdigit() else None,
        "armor": int(window.Assemble_totalarmor.text()),
        "speed": int(window.Assemble_totalspeed.text()),
        "cooldown": int(window.Assemble_totalcooldown.text()),
        "sight": int(window.Assemble_totalsight.text()),
        "range": range_values[-1],
        "minimumRange": int(window.Assemble_minrange.text()),
        "healAmount": int(window.Assemble_healamount.text()),
        "regenerationAmount": int(window.Assemble_regenamount.text()),
    }


def main():
    args = parse_args()
    reference_root = args.reference_root.resolve()
    web_root = Path(__file__).resolve().parent.parent
    snapshot_path = web_root / "src" / "data" / "catalog" / "catalog.snapshot.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))

    dirty_reference = run_git(reference_root, "status", "--porcelain")
    if dirty_reference:
        raise RuntimeError(
            "Reference calculator has uncommitted changes; golden data would not be reproducible."
        )

    source_revision = run_git(reference_root, "rev-parse", "HEAD")
    if source_revision != snapshot["sourceRevision"]:
        raise RuntimeError(
            "Reference revision differs from catalog.snapshot.json. "
            "Run npm run catalog:import first."
        )

    calculator, application, window = load_calculator(reference_root)
    try:
        cases = build_curated_cases() + build_random_cases(calculator)
        output_cases = [
            {
                **case,
                "expected": evaluate(calculator, window, case),
            }
            for case in cases
        ]
    finally:
        window.close()
        application.quit()

    output = {
        "catalogVersion": snapshot["catalogVersion"],
        "sourceRevision": source_revision,
        "randomSeed": RANDOM_SEED,
        "randomCases": RANDOM_CASES,
        "cases": output_cases,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Generated {len(output_cases)} final calculation cases at {args.output.resolve()}")


if __name__ == "__main__":
    main()
