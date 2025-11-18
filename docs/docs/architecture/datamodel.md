# Data Model Overview

The Reverse Engineering Lab platform uses a relational database to manage users, products, and background data. A simplified overview of the full database schema is provided below, along with detailed explanations of each module.

```mermaid
---
config:
    layout: elk
    elk:
        nodePlacementStrategy: LINEAR_SEGMENTS
---
graph TD

        User["User fa:fa-user"]
        OAuthAccount["OAuth Account fa:fa-id-card"]
        Organization["Organization fa:fa-building"]

        Camera["Camera fa:fa-camera"]
        Product["Product fa:fa-box"]
        PhysicalProperties["Physical Properties fa:fa-ruler-combined"]

        Taxonomy["Taxonomy fa:fa-sitemap"]
        Material["Material fa:fa-flask"]
        Category["Category fa:fa-folder-open"]
        ProductType["Product Type fa:fa-tags"]

        subgraph LocalStorage["Local Storage"]
            File["File fa:fa-file"]
            Image["Image fa:fa-image"]
        end
        Video["Video fa:fa-video"]

    User -->|Has| OAuthAccount
    User -->|Belongs to| Organization
    User -->|Owns| Organization

    User -->|Owns| Camera

    User -->|Owns| Product
    Product -->|Has Components| Product
    Product -->|Contains| Material
    Product -->|Is Type Of| ProductType
    Product -->|Has| PhysicalProperties
    ProductType -->|Categorized As| Category
    Material -->|Categorized As| Category
    Category -->|Sub-Category Of| Category
    Category -->|Belongs To| Taxonomy
    Product -->|Has| LocalStorage
    Product -->|Has| Video
    Material -->|Has| LocalStorage
    ProductType -->|Has| LocalStorage

    style LocalStorage fill:#e0e0e0,stroke:#616161,stroke-width:1px;

    classDef UserManagementFill fill:#e1bee7,stroke:#9c27b0,stroke-width:2px;
    class User,OAuthAccount,Organization UserManagementFill;

    classDef DataCollectionFill fill:#bbdefb,stroke:#1976d2,stroke-width:2px;
    class Product,PhysicalProperties,Camera DataCollectionFill;

    classDef BackgroundDataFill fill:#f5f5f5,stroke:#8d6e63,stroke-width:2px;
    class Taxonomy,Material,Category,ProductType BackgroundDataFill;

    classDef MediaFill fill:#c8e6c9,stroke:#43a047,stroke-width:2px;
    class File,Image,Video MediaFill;
```

The full data schema is broken up into four modules: user management, background data management, data collection, and file storage.

## User management

The user management module handles user accounts, organizations, and OAuth account associations.

```mermaid
erDiagram
    USER {
        uuid id PK
        varchar email UK
        varchar hashed_password
        boolean is_active
        boolean is_superuser
        boolean is_verified
        varchar username UK
        uuid organization_id FK
        organizationrole organization_role "optional; owner, admin, member"
    }

    ORGANIZATION {
        uuid id PK
        varchar name UK
        varchar location
        varchar description
        uuid owner_id FK
    }

    OAUTHACCOUNT {
        uuid id PK
        uuid user_id FK
        varchar oauth_name
        varchar access_token
        integer expires_at
        varchar refresh_token
        varchar account_id
        varchar account_email
    }

    USER ||--o| ORGANIZATION : "owns"
    USER }|--o| ORGANIZATION : "is member of"
    USER ||--o{ OAUTHACCOUNT : "has"
```

## Background data management

The background data management module handles taxonomies, categories, materials, and product types. It allows for flexible categorization and linking of materials to products.

```mermaid
erDiagram
    PRODUCTTYPE {
        integer id PK
        varchar name
        varchar description
    }

    MATERIAL {
        integer id PK
        varchar name
        varchar description
        varchar source
        float density_kg_m3
        boolean is_crm
    }

    MATERIALPRODUCTLINK {
        integer material_id PK, FK
        integer product_id PK, FK
        float quantity
        unit unit "g, kg, m, cm"
    }

    CATEGORY {
        integer id PK
        varchar name
        varchar description
        integer taxonomy_id FK
        integer supercategory_id FK
    }

    CATEGORYMATERIALLINK {
        integer category_id PK, FK
        integer material_id PK, FK
    }

    CATEGORYPRODUCTTYPELINK {
        integer category_id PK, FK
        integer product_type_id PK, FK
    }

    TAXONOMY {
        integer id PK
        varchar name
        varchar description
        taxonomydomain domains[] "products, materials, other"
        varchar source
    }

    PRODUCT  }o--|| PRODUCTTYPE : "is type of"
    MATERIAL ||--o{ MATERIALPRODUCTLINK : "is part of"
    PRODUCT ||--o{ MATERIALPRODUCTLINK : "contains"
    CATEGORY ||--o{ CATEGORYMATERIALLINK : "contains"
    MATERIAL ||--o{ CATEGORYMATERIALLINK : "is linked to"
    CATEGORY ||--o{ CATEGORYPRODUCTTYPELINK : "contains"
    PRODUCTTYPE ||--o{ CATEGORYPRODUCTTYPELINK : "is linked to"
    TAXONOMY ||--o{ CATEGORY : "defines"
    CATEGORY ||--o{ CATEGORY : "is subcategory of"
```

## Data collection

The data collection module manages disassembly sessions, products, and their properties.

```mermaid
erDiagram
    RPI_CAMERA {
        uuid id PK
        varchar name
        varchar description
        varchar encrypted_api_key
        uuid owner_id FK
        varchar url
        varchar encrypted_auth_headers
    }

    PRODUCT {
        integer id PK
        varchar name
        varchar description
        varchar brand
        varchar model
        varchar dismantling_notes
        timestamp dismantling_time_start
        timestamp dismantling_time_end
        integer parent_id FK
        integer amount_in_parent
        integer product_type_id FK
        integer owner_id FK
    }

    PHYSICALPROPERTIES {
        integer id PK
        float weight_g
        float height_cm
        float width_cm
        float depth_cm
        integer product_id FK
    }

    VIDEO {
        integer id PK
        varchar url
        varchar description
        integer product_id FK
        jsonb video_metadata
        varchar title
    }

    USER ||--o{ RPI_CAMERA : "owns"
    USER ||--o{ PRODUCT : "owns"
    PRODUCT ||--o{ PHYSICALPROPERTIES : "has"
    PRODUCT ||--o{ VIDEO : "contains"
    PRODUCT ||--o{ PRODUCT : "is part of"
```

## File storage

The file storage module handles files and images associated with products, materials, and product types. It supports polymorphic associations to allow files to be linked to different parent types. Videos are currently not stored in the database but can be linked via URLs.

```mermaid
erDiagram
    FILE {
        uuid id PK
        varchar description
        varchar filename
        varchar file
        fileparenttype parent_type "product, material, product_type"
        integer product_id FK
        integer material_id FK
        integer product_type_id FK
    }

    IMAGE {
        uuid id PK
        varchar description
        varchar filename
        varchar file
        imageparenttype parent_type "product, material, product_type"
        integer product_id FK
        integer material_id FK
        integer product_type_id FK
        jsonb image_metadata
    }

    PRODUCT ||--o{ FILE : "contains"
    MATERIAL ||--o{ FILE : "contains"
    PRODUCTTYPE ||--o{ FILE : "contains"
    PRODUCT ||--o{ IMAGE : "contains"
    MATERIAL ||--o{ IMAGE : "contains"
    PRODUCTTYPE ||--o{ IMAGE : "contains"
```
