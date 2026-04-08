"""Modern test factories using polyfactory for backend test models."""
# spell-checker: ignore bothify, numerify

from typing import Any, TypeVar

from polyfactory.factories.sqlalchemy_factory import SQLAlchemyFactory
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import Organization, User
from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
    TaxonomyDomain,
)
from app.api.data_collection.models.product import (
    MaterialProductLink,
    Product,
)

T = TypeVar("T")


class BaseModelFactory[T](SQLAlchemyFactory[T]):
    """Base factory with custom create_async support for explicit session."""

    __is_base_factory__ = True
    __set_relationships__ = False  # Skip relationship introspection to avoid SQLAlchemy/polyfactory conflicts

    @classmethod
    def get_sqlalchemy_types(cls) -> dict[Any, Any]:
        """Extend polyfactory's built-in SQLAlchemy type support for project-specific columns."""
        sqlalchemy_types = super().get_sqlalchemy_types()
        # Product.search_vector uses PostgreSQL full-text search, which polyfactory does not support natively.
        sqlalchemy_types[TSVECTOR] = lambda: ""
        return sqlalchemy_types

    @classmethod
    def _get_type_from_type_engine(cls, type_engine: object) -> type:
        """Normalize unsupported SQLAlchemy column types to a buildable Python type."""
        if isinstance(type_engine, TSVECTOR):
            return str
        return super()._get_type_from_type_engine(type_engine)

    @classmethod
    def build(cls, **kwargs: Any) -> T:  # noqa: ANN401 # Polyfactory accepts Any-typed kwargs for model fields
        """Build an instance while skipping DB-computed columns like generated TSVECTOR fields."""
        build_context = cls._get_build_context(kwargs.get("_build_context"))
        build_context["skip_computed_fields"] = True
        kwargs["_build_context"] = build_context
        return super().build(**kwargs)

    @classmethod
    async def create_async(cls, session: AsyncSession | None = None, **kwargs: Any) -> T:  # noqa: ANN401 #  Any-type kwargs are expected by the parent class signature
        """Create a new instance, optionally using a provided session."""
        if session:
            instance = cls.build(**kwargs)
            session.add(instance)
            await session.flush()
            await session.refresh(instance)
            return instance
        return await super().create_async(**kwargs)


class UserFactory(BaseModelFactory[User]):
    """Factory for creating User test instances."""

    __model__ = User

    @classmethod
    def email(cls) -> str:
        """Generate mock value."""
        return cls.__faker__.email()

    @classmethod
    def hashed_password(cls) -> str:
        """Generate mock value."""
        return "not_really_hashed"

    @classmethod
    def is_active(cls) -> bool:
        """Generate mock value."""
        return True

    @classmethod
    def is_superuser(cls) -> bool:
        """Generate mock value."""
        return False

    @classmethod
    def is_verified(cls) -> bool:
        """Generate mock value."""
        return True

    @classmethod
    def username(cls) -> str:
        """Generate mock value."""
        return cls.__faker__.user_name()

    @classmethod
    def organization(cls) -> None:
        """Generate mock value."""
        return

    @classmethod
    def organization_id(cls) -> None:
        """Generate mock value."""
        return

    @classmethod
    def owned_organization(cls) -> None:
        """Generate mock value."""
        return

    @classmethod
    def products(cls) -> list:
        """Generate mock value."""
        return []

    @classmethod
    def oauth_accounts(cls) -> list:
        """Generate mock value."""
        return []


class TaxonomyFactory(BaseModelFactory[Taxonomy]):
    """Factory for creating Taxonomy test instances."""

    __model__ = Taxonomy

    @classmethod
    def name(cls) -> str:
        """Generate mock value."""
        return cls.__faker__.catch_phrase()

    @classmethod
    def version(cls) -> str:
        """Generate mock value."""
        return cls.__faker__.numerify(text="v#.#.#")

    @classmethod
    def description(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.text(max_nb_chars=200) if cls.__faker__.boolean() else None

    @classmethod
    def domains(cls) -> set[TaxonomyDomain]:
        """Generate mock value."""
        # Return at least one domain
        domains = [TaxonomyDomain.MATERIALS]
        if cls.__faker__.boolean():
            domains.append(TaxonomyDomain.PRODUCTS)
        return set(domains)

    @classmethod
    def categories(cls) -> list[Category]:
        """Generate mock value."""
        return []

    @classmethod
    def source(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.url() if cls.__faker__.boolean() else None


class CategoryFactory(BaseModelFactory[Category]):
    """Factory for creating Category test instances."""

    __model__ = Category

    @classmethod
    def name(cls) -> str:
        """Generate mock value."""
        return cls.__faker__.word().title()

    @classmethod
    def description(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.sentence() if cls.__faker__.boolean() else None

    @classmethod
    def external_id(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.uuid4() if cls.__faker__.boolean() else None

    @classmethod
    def supercategory_id(cls) -> int | None:
        """Generate mock value."""
        return None

    @classmethod
    def supercategory(cls) -> None:
        """Generate mock value."""
        return

    # taxonomy_id and supercategory_id should be set explicitly in tests


class MaterialFactory(BaseModelFactory[Material]):
    """Factory for creating Material test instances."""

    __model__ = Material

    @classmethod
    def name(cls) -> str:
        """Generate mock value."""
        materials = ["Steel", "Aluminum", "Copper", "Titanium", "Carbon Fiber", "Glass", "Ceramic"]
        return cls.__faker__.random_element(elements=materials)

    @classmethod
    def description(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.sentence() if cls.__faker__.boolean() else None

    @classmethod
    def source(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.url() if cls.__faker__.boolean() else None

    @classmethod
    def density_kg_m3(cls) -> float | None:
        """Generate mock value."""
        return (
            round(cls.__faker__.pyfloat(min_value=100, max_value=20000), 2)
            if cls.__faker__.boolean(chance_of_getting_true=80)
            else None
        )

    @classmethod
    def is_crm(cls) -> bool | None:
        """Generate mock value."""
        return cls.__faker__.boolean() if cls.__faker__.boolean(chance_of_getting_true=80) else None


class ProductTypeFactory(BaseModelFactory[ProductType]):
    """Factory for creating ProductType test instances."""

    __model__ = ProductType

    @classmethod
    def name(cls) -> str:
        """Generate mock value."""
        product_types = ["Electronics", "Furniture", "Appliances", "Tools", "Packaging", "Automotive Parts"]
        return cls.__faker__.random_element(elements=product_types)

    @classmethod
    def description(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.sentence() if cls.__faker__.boolean() else None


class CategoryMaterialLinkFactory(BaseModelFactory[CategoryMaterialLink]):
    """Factory for creating CategoryMaterialLink instances."""

    __model__ = CategoryMaterialLink

    # category_id and material_id should be set explicitly


class CategoryProductTypeLinkFactory(BaseModelFactory[CategoryProductTypeLink]):
    """Factory for creating CategoryProductTypeLink instances."""

    __model__ = CategoryProductTypeLink

    # category_id and product_type_id should be set explicitly


class ProductFactory(BaseModelFactory[Product]):
    """Factory for creating Product test instances."""

    __model__ = Product

    @classmethod
    def name(cls) -> str:
        """Generate mock value."""
        return cls.__faker__.bs().title()

    @classmethod
    def description(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.text(max_nb_chars=200)

    @classmethod
    def brand(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.company()

    @classmethod
    def model(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.bothify(text="??-####")

    @classmethod
    def parent_id(cls) -> int | None:
        """Generate mock value."""
        return None

    @classmethod
    def amount_in_parent(cls) -> int | None:
        """Generate mock value."""
        return None

    @classmethod
    def components(cls) -> list:
        """Generate mock value."""
        return []

    @classmethod
    def bill_of_materials(cls) -> list:
        """Generate mock value."""
        return []


class MaterialProductLinkFactory(BaseModelFactory[MaterialProductLink]):
    """Factory for creating MaterialProductLink instances."""

    __model__ = MaterialProductLink

    @classmethod
    def quantity(cls) -> float:
        """Generate mock value."""
        return cls.__faker__.pyfloat(positive=True, min_value=0.1, max_value=10.0)


class OrganizationFactory(BaseModelFactory[Organization]):
    """Factory for creating Organization test instances."""

    __model__ = Organization

    @classmethod
    def name(cls) -> str:
        """Generate mock value."""
        return cls.__faker__.unique.company()

    @classmethod
    def location(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.city() if cls.__faker__.boolean() else None

    @classmethod
    def description(cls) -> str | None:
        """Generate mock value."""
        return cls.__faker__.catch_phrase() if cls.__faker__.boolean() else None
