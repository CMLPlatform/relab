"""Unit tests for common query/loading/scoped CRUD helpers."""

from __future__ import annotations

from typing import Any, cast  # lgtm[py/unused-import]
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.api.common.crud.exceptions import CRUDConfigurationError
from app.api.common.crud.filtering import apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.query import require_locked_model, require_model
from app.api.reference_data.filters import MaterialFilterWithRelationships
from app.api.reference_data.models import Material


class TestRequireModel:
    """Tests for model lookup error paths."""

    async def test_raises_crud_configuration_error_for_model_without_id(self) -> None:
        """Models without an id attribute should fail before querying."""
        session = AsyncMock()

        class NoIdModel:
            pass

        with pytest.raises(CRUDConfigurationError, match="does not have an id field"):
            await require_model(session, cast("type[Any]", NoIdModel), 1)

    async def test_require_locked_model_applies_for_update(self) -> None:
        """Locked lookup helper should add FOR UPDATE to the generated SELECT."""
        material = Material(id=1, name="Steel")
        session = MagicMock()
        session.execute = AsyncMock()
        result = MagicMock()
        session.execute.return_value = result
        result.scalars.return_value.unique.return_value.one_or_none.return_value = material

        found = await require_locked_model(session, Material, 1)

        assert found is material
        statement = session.execute.await_args.args[0]
        assert str(statement.compile()).endswith("FOR UPDATE")


class TestQueryConstruction:
    """Tests for query filtering and relationship loading."""

    def test_does_not_apply_noload_without_read_schema(self) -> None:
        """Loader profiles should leave statements unchanged without explicit loaders."""
        statement = select(Material)

        updated_statement = apply_loader_profile(statement, Material)

        assert str(updated_statement) == str(statement)

    def test_accepts_explicit_base_statement(self) -> None:
        """Explicit SQLAlchemy statements should remain stable through loader application."""
        statement = select(Material).where(Material.id == 1)

        updated_statement = apply_loader_profile(statement, Material)

        assert str(updated_statement) == str(statement)

    def test_inactive_filter_leaves_statement_unchanged(self) -> None:
        """Empty fastapi-filters FilterSets should not add joins or where clauses."""
        statement = select(Material)

        updated_statement = apply_filter(statement, Material, MaterialFilterWithRelationships())

        assert str(updated_statement) == str(statement)

    def test_relationship_filter_uses_explicit_join_metadata(self) -> None:
        """Relationship-backed fields should join only their allowlisted relationship."""
        filters = MaterialFilterWithRelationships.from_ops(MaterialFilterWithRelationships.category_name.ilike("metal"))

        updated_statement = apply_filter(select(Material), Material, filters)
        sql = str(updated_statement).lower()

        assert "join categorymateriallink" in sql
        assert "join category" in sql
        assert "category.name" in sql

    def test_relationship_sort_uses_explicit_join_metadata(self) -> None:
        """Relationship-backed sort fields should also join their allowlisted relationship."""
        filters = MaterialFilterWithRelationships().with_sorting([("category_name", "asc", None)])

        updated_statement = apply_filter(select(Material), Material, filters)
        sql = str(updated_statement).lower()

        assert "join categorymateriallink" in sql
        assert "join category" in sql
        assert "order by category.name asc" in sql

    def test_relationship_filter_value_is_bound_not_sql_text(self) -> None:
        """Relationship-backed filter values should remain bind params after allowlisted joins."""
        value = "metal'); DROP TABLE material; --"
        filters = MaterialFilterWithRelationships.from_ops(MaterialFilterWithRelationships.category_name.ilike(value))

        compiled = apply_filter(select(Material), Material, filters).compile(dialect=postgresql.dialect())

        assert value not in str(compiled)
        assert value in compiled.params.values()
