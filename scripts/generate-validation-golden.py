import argparse
import importlib
import json
import os
import random
import subprocess
import sys
from pathlib import Path


RANDOM_SEED = 1492_06
RANDOM_CASES = 512


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
        / "assembly-validation.golden.json"
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


def part_ids(leg, body, weapon, accessory):
    return {
        "leg": leg,
        "body": body,
        "weapon": weapon,
        "accessory": accessory,
    }


def build_curated_cases():
    return [
        ("valid", part_ids(40, 1, 1, 0)),
        ("all-required-parts-missing", part_ids(0, 0, 0, 0)),
        ("leg-missing-and-overweight", part_ids(0, 1, 1, 0)),
        ("body-missing", part_ids(40, 0, 1, 0)),
        ("weapon-missing", part_ids(40, 1, 0, 0)),
        ("mount-type-mismatch", part_ids(40, 5, 1, 0)),
        ("load-exceeded", part_ids(7, 1, 1, 0)),
        ("three-n-parts", part_ids(10, 11, 4, 0)),
        ("two-n-parts", part_ids(40, 11, 4, 0)),
        ("apocalypse-body-too-light", part_ids(18, 10, 60, 0)),
        ("apocalypse-towering-conflict", part_ids(18, 1, 60, 28)),
        ("missing-load-and-apocalypse-conflicts", part_ids(0, 10, 60, 28)),
        ("mismatch-before-load", part_ids(7, 5, 1, 0)),
        ("load-before-n-part-limit", part_ids(7, 11, 4, 0)),
        ("both-apocalypse-conflicts", part_ids(18, 10, 60, 28)),
    ]


def build_random_cases(calculator):
    rng = random.Random(RANDOM_SEED)
    id_sets = [
        [item["ID"] for item in calculator.legData],
        [item["ID"] for item in calculator.bodyData],
        [item["ID"] for item in calculator.weaponData],
        [item["ID"] for item in calculator.accData],
    ]
    return [
        (
            f"random-validation-{index:03d}",
            part_ids(*(rng.choice(ids) for ids in id_sets)),
        )
        for index in range(RANDOM_CASES)
    ]


def evaluate(calculator, window, selected_ids):
    index_sets = [
        {item["ID"]: index for index, item in enumerate(calculator.legData)},
        {item["ID"]: index for index, item in enumerate(calculator.bodyData)},
        {item["ID"]: index for index, item in enumerate(calculator.weaponData)},
        {item["ID"]: index for index, item in enumerate(calculator.accData)},
    ]
    calculator.legIndex = index_sets[0][selected_ids["leg"]]
    calculator.bodyIndex = index_sets[1][selected_ids["body"]]
    calculator.weaponIndex = index_sets[2][selected_ids["weapon"]]
    calculator.accIndex = index_sets[3][selected_ids["accessory"]]
    window.Assemble()

    labels = {
        "조립 완료": "complete",
        "부품 없음": "parts-missing",
        "형태 불일치": "mount-type-mismatch",
        "하중 초과": "load-exceeded",
        "N템 개수 초과": "n-part-limit-exceeded",
        "무게 30 이상 몸통 필요": "apocalypse-body-too-light",
        "타워링과 조립 불가": "apocalypse-towering-conflict",
    }
    slot_widgets = [
        ("leg", window.LegBtn),
        ("body", window.BodyBtn),
        ("weapon", window.WeaponBtn),
        ("accessory", window.AccBtn),
    ]
    status = labels[window.Assemble_label.text()]
    return {
        "isValid": status == "complete",
        "status": status,
        "invalidPartSlots": [
            slot for slot, widget in slot_widgets if widget.styleSheet().strip()
        ],
        "weightInvalid": bool(window.Assemble_weight.styleSheet().strip()),
    }


def main():
    args = parse_args()
    reference_root = args.reference_root.resolve()
    web_root = Path(__file__).resolve().parent.parent
    snapshot_path = web_root / "src" / "data" / "catalog" / "catalog.snapshot.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))

    if run_git(reference_root, "status", "--porcelain"):
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
                "name": name,
                "partIds": selected_ids,
                "expected": evaluate(calculator, window, selected_ids),
            }
            for name, selected_ids in cases
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
    print(f"Generated {len(output_cases)} validation cases at {args.output.resolve()}")


if __name__ == "__main__":
    main()
