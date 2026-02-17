"""Modern test factories using polyfactory for background data models.

Polyfactory provides better Pydantic v2 support and native async capabilities.
"""

from typing import Generic, TypeVar

from polyfactory.factories.sqlalchemy_factory import SQLAlchemyFactory
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.models import User
from app.api.background_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    Taxonomy,
    TaxonomyDomain,
)

T = TypeVar("T")


class BaseModelFactory(Generic[T], SQLAlchemyFactory[T]):
    """Base factory with custom create_async support for explicit session."""

    __is_base_factory__ = True
    __set_relationships__ = False  # Skip relationship introspection to avoid SQLAlchemy/polyfactory conflicts

    @classmethod
    async def create_async(cls, session: AsyncSession | None = None, **kwargs) -> T:
        """Create a new instance, optionally using a provided session."""
        if session:
            instance = cls.build(**kwargs)
            session.add(instance)
            await session.commit()
            await session.refresh(instance)
            return instance
        return await super().create_async(**kwargs)


class UserFactory(BaseModelFactory[User]):
    """Factory for creating User test instances."""

    __model__ = User

    @classmethod
    def email(cls) -> str:
        return cls.__faker__.email()

    @classmethod
    def hashed_password(cls) -> str:
        return "not_really_hashed"

    @classmethod
    def is_active(cls) -> bool:
        return True

    @classmethod
    def is_superuser(cls) -> bool:
        return False

    @classmethod
    def is_verified(cls) -> bool:
        return True

    @classmethod
    def username(cls) -> str:
        return cls.__faker__.user_name()

    @classmethod
    def organization(cls) -> None:
        return None

    @classmethod
    def organization_id(cls) -> None:
        return None

    @classmethod
    def owned_organization(cls) -> None:
        return None

    @classmethod
    def products(cls) -> list:
        return []

    @classmethod
    def oauth_accounts(cls) -> list:
        return []


class TaxonomyFactory(BaseModelFactory[Taxonomy]):
    """Factory for creating Taxonomy test instances."""

    __model__ = Taxonomy

    @classmethod
    def name(cls) -> str:
        return cls.__faker__.catch_phrase()

    @classmethod
    def version(cls) -> str:
        return cls.__faker__.numerify(text="v#.#.#")

    @classmethod
    def description(cls) -> str | None:
        return cls.__faker__.text(max_nb_chars=200) if cls.__faker__.boolean() else None

    @classmethod
    def domains(cls) -> set[TaxonomyDomain]:
        # Return at least one domain
        domains = [TaxonomyDomain.MATERIALS]
        if cls.__faker__.boolean():
            domains.append(TaxonomyDomain.PRODUCTS)
        return set(domains)

    @classmethod
    def categories(cls) -> list[Category]:
        return []

    @classmethod
    def source(cls) -> str | None:
        return cls.__faker__.url() if cls.__faker__.boolean() else None


class CategoryFactory(BaseModelFactory[Category]):
    """Factory for creating Category test instances."""

    __model__ = Category

    @classmethod
    def name(cls) -> str:
        return cls.__faker__.word().title()

    @classmethod
    def description(cls) -> str | None:
        return cls.__faker__.sentence() if cls.__faker__.boolean() else None

    @classmethod
    def external_id(cls) -> str | None:
        return cls.__faker__.uuid4() if cls.__faker__.boolean() else None

    @classmethod
    def supercategory_id(cls) -> int | None:
        return None

    @classmethod
    def supercategory(cls) -> None:
        return None

    # taxonomy_id and supercategory_id should be set explicitly in tests


class MaterialFactory(BaseModelFactory[Material]):
    """Factory for creating Material test instances."""

    __model__ = Material

    @classmethod
    def name(cls) -> str:
        materials = ["Steel", "Aluminum", "Copper", "Titanium", "Carbon Fiber", "Glass", "Ceramic"]
        return cls.__faker__.random_element(elements=materials)

    @classmethod
    def description(cls) -> str | None:
        return cls.__faker__.sentence() if cls.__faker__.boolean() else None

    @classmethod
    def source(cls) -> str | None:
        return cls.__faker__.url() if cls.__faker__.boolean() else None

    @classmethod
    def density_kg_m3(cls) -> float | None:
        return (
            round(cls.__faker__.pyfloat(min_value=100, max_value=20000), 2)
            if cls.__faker__.boolean(chance_of_getting_true=80)
            else None
        )

    @classmethod
    def is_crm(cls) -> bool | None:
        return cls.__faker__.boolean() if cls.__faker__.boolean(chance_of_getting_true=80) else None


class ProductTypeFactory(BaseModelFactory[ProductType]):
    """Factory for creating ProductType test instances."""

    __model__ = ProductType

    @classmethod
    def name(cls) -> str:
        product_types = ["Electronics", "Furniture", "Appliances", "Tools", "Packaging", "Automotive Parts"]
        return cls.__faker__.random_element(elements=product_types)

    @classmethod
    def description(cls) -> str | None:
        return cls.__faker__.sentence() if cls.__faker__.boolean() else None


class CategoryMaterialLinkFactory(BaseModelFactory[CategoryMaterialLink]):
    """Factory for creating CategoryMaterialLink instances."""

    __model__ = CategoryMaterialLink

    # category_id and material_id should be set explicitly


class CategoryProductTypeLinkFactory(BaseModelFactory[CategoryProductTypeLink]):
    """Factory for creating CategoryProductTypeLink instances."""

    __model__ = CategoryProductTypeLink

    # category_id and product_type_id should be set explicitly
