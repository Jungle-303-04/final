from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RETIRED_PRODUCT_NAME = "ra" + "dar"


def product_runtime_paths() -> list[Path]:
    paths = [ROOT / "README.md"]
    for directory in ("frontend/src", "src", "desktop", "deploy"):
        paths.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())

    # These tools inspect the isolated source and must retain source identifiers
    # to verify provenance or to remove them while importing. They are not part
    # of the shipped product/runtime boundary.
    reference_tool_prefixes = ("reference-",)
    for path in (ROOT / "scripts").iterdir():
        if not path.is_file() or path.name.startswith(reference_tool_prefixes):
            continue
        if path.name == "commit-denylist.txt":
            continue
        paths.append(path)
    return sorted(paths)


def test_product_runtime_and_root_readme_do_not_use_retired_product_name() -> None:
    offenders = []
    for path in product_runtime_paths():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Images and compiled desktop assets cannot carry user-facing
            # product copy. Their source paths remain covered by the ledger.
            continue
        if RETIRED_PRODUCT_NAME.casefold() in text.casefold():
            offenders.append(path.relative_to(ROOT).as_posix())

    assert offenders == []
    assert not (ROOT / "scripts" / f"{RETIRED_PRODUCT_NAME}.sh").exists()


def test_makefile_has_no_retired_runtime_target() -> None:
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")

    assert f"\n{RETIRED_PRODUCT_NAME}:" not in makefile
