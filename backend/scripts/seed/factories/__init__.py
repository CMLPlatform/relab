"""Model factories shared by the test suite and the CI/E2E/perf seeders.

These live under ``scripts/`` rather than ``tests/`` because the seeders that
need them run inside the migrations image, which ships ``scripts/`` but no test
code. Their polyfactory and faker dependencies are the optional
``seed-fixtures`` group, enabled per image by ``INCLUDE_FIXTURE_SEED_DEPS``, so
a production migrations image still carries neither.
"""
