"""Factory-boy factories for generating test objects."""

from .background_data import CategoryFactory, MaterialFactory, ProductTypeFactory, TaxonomyFactory
from .emails import EmailContextFactory, EmailDataFactory
from .products import (
    CircularityPropertiesFactory,
    CompleteProductFactory,
    PhysicalPropertiesFactory,
    ProductFactory,
)
from .users import OAuthAccountFactory, OrganizationFactory, SuperuserFactory, UserFactory

__all__ = [
    # Background data
    "CategoryFactory",
    "MaterialFactory",
    "ProductTypeFactory",
    "TaxonomyFactory",
    # Emails
    "EmailContextFactory",
    "EmailDataFactory",
    # Products
    "CircularityPropertiesFactory",
    "CompleteProductFactory",
    "PhysicalPropertiesFactory",
    "ProductFactory",
    # Users
    "OAuthAccountFactory",
    "OrganizationFactory",
    "SuperuserFactory",
    "UserFactory",
]
