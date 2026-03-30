# System Design

<div class="relab-section-intro">
RELab is split into a research app, a public website, and backend services so each part can evolve without forcing every workflow into one interface.
</div>

This structure follows the broader research goal of the platform: generate product-level observations through practical data collection workflows, make them publicly viewable and reusable, and keep the system open enough to link with other data infrastructures later.

## High-Level Architecture

```mermaid
graph TD
    Researcher[Researcher] -->|Data entry| FrontendApp[Expo App]
    PublicUser[Public visitor] -->|Reads public pages| FrontendWeb[Astro Web Frontend]

    FrontendApp -->|API requests| Backend[FastAPI Backend]
    FrontendWeb -->|Selected API usage| Backend
    Backend -->|Cache reads/writes| Redis[(Redis Cache)]
    Backend -->|Queries| PostgreSQL[(PostgreSQL)]

    subgraph AuthenticationLayer [Authentication Layer]
        OAuthProviders[OAuth: GitHub, Google]
        AuthSystem[Bearer/cookie auth + refresh tokens]
    end

    Researcher -->|Authenticates| AuthenticationLayer

    Backend -->|Camera integration| RaspberryPi[RPI Camera API]
    Backend -->|Optional streaming| YouTube[YouTube API]
    Backend -->|Schema migrations| Alembic[Alembic]
    Alembic --> PostgreSQL
```

## Monorepo Structure

- `backend/`: main API, persistence, auth, file handling, and plugin integration
- `frontend-app/`: authenticated mobile-first data collection client built with Expo Router
- `frontend-web/`: public site built with Astro
- `docs/`: documentation site
- Compose files at the repository root coordinate local and deployed multi-service setups

## Technology Choices

- **Backend API**: FastAPI
- **Persistence layer**: SQLModel and SQLAlchemy
- **Database**: PostgreSQL
- **Migrations**: Alembic
- **Caching and token infrastructure**: Redis
- **Research app frontend**: Expo / React Native
- **Public web frontend**: Astro
- **Docs site**: Zensical

These choices keep the stack relatively small and understandable, while still supporting public access, API interoperability, and later AI-assisted workflows.

## Backend Domain Structure

The backend is organised mainly by domain rather than by HTTP verb alone:

```sh
app/
├── api/
│   ├── auth/             # Login, registration, OAuth, users, organizations
│   ├── background_data/  # Taxonomies, categories, materials, product types, units
│   ├── data_collection/  # Products, components, search, related properties
│   ├── file_storage/     # Uploaded files, images, linked media records
│   ├── newsletter/       # Newsletter subscription flows
│   ├── plugins/          # Optional integrations such as rpi_cam
│   └── common/           # Shared routers, helpers, exceptions
├── core/                 # Runtime configuration, DB, cache, logging, HTTP clients
├── static/               # Static assets served by the backend
└── templates/            # Email and HTML templates
```

## Runtime Behavior

At startup the backend:

- validates security-sensitive configuration
- initializes Redis and API caching
- creates storage directories for uploads
- mounts static and upload-backed routes
- prepares shared outbound HTTP clients
- starts background cleanup infrastructure

## Design Priorities

- keep the data model explicit and inspectable
- support authenticated data entry from a dedicated app
- allow public and private API surfaces to coexist
- preserve a path toward dataset publication and external reuse
- support FAIR-style reuse through open interfaces and documented structure
- keep the data model suitable for later benchmarking and AI-assisted enrichment
- avoid unnecessary infrastructure complexity for a PhD-scale project
