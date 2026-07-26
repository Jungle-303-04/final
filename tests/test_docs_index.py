from pathlib import Path


DOCS_ROOT = Path(__file__).resolve().parents[1] / "docs"
README = DOCS_ROOT / "README.md"

REQUIRED_KEYWORDS = (
    "command",
    "target",
    "evidence",
    "RCA",
    "Safe PR",
    "dashboard",
    "permission",
    "Bruno",
    "AWS",
    "event",
    "provider",
    "worker",
    "test",
    "GitOps",
    "realtime",
)

FORBIDDEN_DOC_TERMS = (
    "K8sGPT",
    "HolmesGPT",
    "Kubeheal",
    "Cloudflare",
)


def test_docs_readme_links_all_top_level_docs() -> None:
    assert README.exists(), "docs/README.md must be the documentation root"
    readme_text = README.read_text(encoding="utf-8")

    docs = sorted(path for path in DOCS_ROOT.glob("*.md") if path.name != README.name)
    assert docs, "docs/README.md should link at least one top-level docs/*.md file"

    missing = [
        path.name
        for path in docs
        if f"./{path.name}" not in readme_text and f"docs/{path.name}" not in readme_text
    ]
    assert not missing, f"docs/README.md is missing links to: {', '.join(missing)}"


def test_docs_readme_keyword_entrypoints() -> None:
    text = README.read_text(encoding="utf-8")
    missing = [keyword for keyword in REQUIRED_KEYWORDS if keyword not in text]
    assert not missing, f"docs/README.md missing keyword entrypoints: {', '.join(missing)}"


def test_docs_avoid_forbidden_external_product_terms() -> None:
    docs = sorted(DOCS_ROOT.glob("*.md"))
    hits: list[str] = []
    for path in docs:
        text = path.read_text(encoding="utf-8")
        for term in FORBIDDEN_DOC_TERMS:
            if term in text:
                hits.append(f"{path.relative_to(DOCS_ROOT.parent)}: {term}")

    assert not hits, "Use generic wording such as 외부 기준 저장소 or 벤치마크 최소선: " + ", ".join(
        hits
    )
