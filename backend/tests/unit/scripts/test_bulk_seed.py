"""Unit tests for the bulk fixture generator.

The generator has no runtime assertions of its own: a badly shaped row still
inserts and still benchmarks, it just benchmarks the wrong thing. These cover
the properties that would otherwise degrade in silence.
"""

import random
from datetime import UTC, datetime

import pytest

from scripts.seed.bulk_seed import (
    DESCRIPTION_MAX,
    NAME_MAX,
    RANDOM_SEED,
    REFERENCE_MINIMUMS,
    _prepare,
    _target,
)
from scripts.seed.factories.models import ProductFactory


def _build_batch(count: int, seed: int = RANDOM_SEED) -> list:
    rng = random.Random(seed)  # noqa: S311 # Fixture data, not cryptography
    now = datetime(2026, 9, 9, tzinfo=UTC)
    products = []
    for _ in range(count):
        product = ProductFactory.build()
        _prepare(product, rng, [1, 2, 3], [10, 20], now)
        products.append(product)
    return products


def test_generated_text_fits_the_column_limits() -> None:
    """Name is String(100) and description String(500); an overflow fails only at insert time."""
    for product in _build_batch(300):
        assert len(product.name) <= NAME_MAX
        if product.description is not None:
            assert len(product.description) <= DESCRIPTION_MAX


def test_indexed_text_columns_have_realistic_cardinality() -> None:
    """name, brand and model are trigram-indexed; a small value set flatters those indexes."""
    products = _build_batch(300)
    assert len({p.name for p in products}) > 200
    assert len({p.brand for p in products}) > 100


def test_created_at_is_spread_rather_than_clustered() -> None:
    """The product list sorts on created_at; identical timestamps make that sort degenerate."""
    timestamps = {p.created_at for p in _build_batch(300)}
    assert len(timestamps) > 250

    assert (max(timestamps) - min(timestamps)).days > 300


def test_required_foreign_keys_are_populated() -> None:
    """The factory leaves nullable columns empty; the seeder has to fill the ones the DB needs."""
    for product in _build_batch(50):
        assert product.owner_id in {1, 2, 3}
        assert product.product_type_id in {10, 20}
        assert product.id is None


@pytest.mark.parametrize("kind", list(REFERENCE_MINIMUMS))
def test_reference_tables_scale_with_products_but_never_below_a_floor(kind: str) -> None:
    """Lookup endpoints page over these, so a handful of rows measures nothing."""
    assert _target(kind, 0) == REFERENCE_MINIMUMS[kind]
    assert _target(kind, 100_000) > REFERENCE_MINIMUMS[kind]
