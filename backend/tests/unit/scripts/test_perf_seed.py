"""Unit tests for the perf-baseline product generator.

The generator has no assertions of its own at runtime: a bad row still inserts and
still benchmarks, it just benchmarks the wrong thing. These cover the two
properties that would otherwise degrade silently.
"""

import random
from datetime import UTC, datetime

from scripts.seed.perf_seed import RANDOM_SEED, _build_product


def _build_batch(count: int, seed: int = RANDOM_SEED) -> list:
    rng = random.Random(seed)  # noqa: S311 # Fixture data, not cryptography
    now = datetime(2026, 9, 9, tzinfo=UTC)
    return [_build_product(rng, index, [1, 2, 3], [10, 20], now) for index in range(count)]


def test_generation_is_reproducible_for_a_given_seed() -> None:
    """Two runs on the same seed must produce identical rows, or baselines are not comparable."""
    first = [(p.name, p.brand, p.model, p.created_at) for p in _build_batch(50)]
    second = [(p.name, p.brand, p.model, p.created_at) for p in _build_batch(50)]
    assert first == second


def test_indexed_text_columns_have_realistic_cardinality() -> None:
    """name, brand and model are trigram-indexed; a short value set flatters those indexes."""
    products = _build_batch(500)
    assert len({p.brand for p in products}) > 50
    assert len({p.name for p in products}) > 400
    assert len({p.model for p in products}) > 400


def test_created_at_is_spread_rather_than_clustered() -> None:
    """The product list sorts on created_at; identical timestamps make that sort degenerate."""
    timestamps = {p.created_at for p in _build_batch(500)}
    assert len(timestamps) > 400

    span = max(timestamps) - min(timestamps)
    assert span.days > 300


def test_generated_text_fits_the_column_limits() -> None:
    """Name is String(100) and description String(500); an overflow fails only at insert time."""
    for product in _build_batch(500):
        assert len(product.name) <= 100
        assert len(product.description) <= 500
