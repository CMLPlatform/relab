"""Unit tests for fastapi-cache key builder."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import key_builder_excluding_dependencies

if TYPE_CHECKING:
    from collections.abc import Callable

    import pytest_mock


def _make_func(name: str = "test_func") -> Callable[..., Any]:
    def f() -> None:
        pass

    f.__module__ = "test.module"
    f.__name__ = name
    return f


class TestKeyBuilderExcludingDependencies:
    """The custom key builder excludes AsyncSession (and other injected deps) from the key."""

    def test_same_args_produce_same_key_with_namespace_prefix(self) -> None:
        """Identical args → identical key; key starts with the namespace."""
        func = _make_func()
        key1 = key_builder_excluding_dependencies(func, namespace="ns", args=(), kwargs={"p": "v"})
        key2 = key_builder_excluding_dependencies(func, namespace="ns", args=(), kwargs={"p": "v"})
        assert key1 == key2
        assert key1.startswith("ns:")

    def test_excludes_async_session(self, mocker: pytest_mock.MockerFixture) -> None:
        """Different AsyncSession instances must not affect the cache key."""
        func = _make_func()
        s1 = mocker.Mock(spec=AsyncSession)
        s2 = mocker.Mock(spec=AsyncSession)

        key1 = key_builder_excluding_dependencies(func, namespace="ns", args=(), kwargs={"session": s1, "q": "x"})
        key2 = key_builder_excluding_dependencies(func, namespace="ns", args=(), kwargs={"session": s2, "q": "x"})

        assert key1 == key2

    def test_non_excluded_params_differentiate_keys(self, mocker: pytest_mock.MockerFixture) -> None:
        """Changing a non-session kwarg must produce a different key."""
        func = _make_func()
        session = mocker.Mock(spec=AsyncSession)

        key1 = key_builder_excluding_dependencies(
            func, namespace="ns", args=(), kwargs={"session": session, "filter": "active"}
        )
        key2 = key_builder_excluding_dependencies(
            func, namespace="ns", args=(), kwargs={"session": session, "filter": "inactive"}
        )

        assert key1 != key2

    def test_handles_none_kwargs(self) -> None:
        """None kwargs should not crash the builder."""
        func = _make_func()
        key = key_builder_excluding_dependencies(func, namespace="ns", args=(), kwargs=None)
        assert isinstance(key, str)
        assert key.startswith("ns:")
