"""The app's generated theme keeps its colours in a plain @theme block.

With `@theme inline`, Tailwind resolves opacity classes such as bg-primary/12 against the
`unset` value Uniwind declares for each theme variable, and every one compiles to
color-mix(unset, ...). `just assets-check` keeps the file in step with its generator.
"""

from pathlib import Path

BRAND_CSS = Path(__file__).resolve().parents[1] / "app/src/theme/brand.generated.css"


def test_brand_colours_use_plain_theme() -> None:
    css = BRAND_CSS.read_text()

    assert "@theme inline" not in css
    assert "@theme {" in css
    assert "--color-primary: var(--primary);" in css
