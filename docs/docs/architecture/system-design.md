# System Design

The Reverse Engineering Lab platform is designed as a modular application for collecting, categorizing, and analyzing disassembled durable goods data to support circular economy research and computer vision applications.

## High-Level Architecture

```mermaid
graph TD
    User["User fa:fa-user"] -->|Interacts with| Frontend[Expo UI fa:fa-mobile]
    SuperUser["Superuser fa:fa-user-shield"] -->|Interacts with| SQLAdmin[SQL Admin fa:fa-database]

    %% Core backend and DB
    Frontend -->|API Requests fa:fa-arrow-right| Backend[FastAPI Backend <i class="fa fa-server" style="color:#43a047;"></i>]
    SQLAdmin -->|Interfaces with fa:fa-link| Backend
    Backend -->|Queries fa:fa-database| PostgreSQL[(PostgreSQL <i class="fa fa-database" style="color:#1976d2;"></i>)]

    %% Authentication
    subgraph AuthenticationLayer ["Authentication Layer fa:fa-lock"]
        OAuthProviders[OAuth: GitHub, Google fa:fa-users]
        AuthSystem[JWT, API Keys fa:fa-key]
    end

    User -->|Authenticates via fa:fa-sign-in-alt| AuthenticationLayer
    SuperUser -->|Authenticates via fa:fa-sign-in-alt| AuthenticationLayer

    %% External systems
    Backend -->|API access fa:fa-video| RaspberryPi[Raspberry Pi Camera API <i class="fab fa-raspberry-pi" style="color:#e91e63;"></i>]
    Backend -->|Integration <i class="fa-brands fa-youtube"></i>| YouTube[YouTube API <i class="fab fa-youtube" style="color:#ff0000;"></i>]
    AuthSystem -.->|Secures fa:fa-shield-alt| RaspberryPi
    OAuthProviders -.->|Required for fa:fa-check-circle| YouTube

    %% Database migrations
    Backend -->|Migrations fa:fa-sync-alt| Alembic[Alembic fa:fa-code]
    Alembic -->|Schema updates fa:fa-database| PostgreSQL

    style Frontend fill:#e0f7fa,stroke:#00acc1,stroke-width:2px
    style Backend fill:#e8f5e9,stroke:#4caf50,stroke-width:2px
    style PostgreSQL fill:#bbdefb,stroke:#1976d2,stroke-width:2px;
    style SQLAdmin fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    style RaspberryPi fill:#f8bbd0,stroke:#e91e63,stroke-width:2px;
    style YouTube fill:#ffe6e6,stroke:#ff0000,stroke-width:2px;
    style Alembic fill:#fce4ec,stroke:#f06292,stroke-width:2px
    style AuthenticationLayer fill:#e0e0e0,stroke:#616161,stroke-width:2px,stroke-dasharray: 5 5;


    classDef UserFill fill:#ffe0b2,stroke:#ff9800,stroke-width:2px;
    class User,SuperUser UserFill;
    classDef AuthFill fill:#fff,stroke:#0000,stroke-width:2px;
    class OAuthProviders,AuthSystem AuthFill;

```

## Technology Stack

- **Backend**: [FastAPI](https://fastapi.tiangolo.com/)
- **Admin interface**: [SQLAdmin](https://github.com/aminalaee/sqladmin)
- **ORM layer**: [SQLModel](https://github.com/fastapi/sqlmodel)
- **Migrations**: [Alembic](https://alembic.sqlalchemy.org/en/latest/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **Frontend**: [Expo](https://docs.expo.dev/) (planned)
- **Machine learning**: [PyTorch](https://pytorch.org/) (planned)

## Backend Application Structure

The backend application follows a modular structure organized by domain-specific components:

```sh
app/
├── api/                  # API modules
│   ├── admin/            # Admin interface
│   ├── auth/             # Authentication
│   ├── background_data/  # Taxonomies, materials, product types
│   ├── common/           # Shared utilities
│   ├── data_collection/  # Products and components
│   ├── file_storage/     # File and image handling
│   └── plugins/          # Plugin modules (e.g., rpi_cam)
├── core/                 # Core application modules
│   ├── config.py         # Configuration settings
│   ├── database.py       # Database connection
│   └── utils/            # Core utilities
├── static/               # Static files
└── templates/            # HTML templates
```
