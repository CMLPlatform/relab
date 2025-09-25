# Contributing to Reverse Engineering Lab

Thank you for your interest in contributing to the Reverse Engineering Lab project! This guide will help you get started with the development process and outline our expectations for contributions.

## Overview

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Recommended: Devcontainer Setup](#recommended-devcontainer-setup)
    - [Initial Setup](#initial-setup)
    - [Using Devcontainers](#using-devcontainers)
  - [Alternative: Local Development Setup](#alternative-local-development-setup)
    - [Backend Setup](#backend-setup)
    - [Documentation Setup](#documentation-setup)
    - [Frontend Setup](#frontend-setup)
- [Development Workflow](#development-workflow)
  - [Backend Development](#backend-development)
    - [Running the Application](#running-the-application)
    - [Code Style Guidelines](#code-style-guidelines)
    - [Testing](#testing)
    - [Database Migrations](#database-migrations)
  - [Frontend Development](#frontend-development)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [License](#license)

## Code of Conduct

By participating in this project, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Getting Started

We recommend using [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers) for development, as this provides a consistent, ready-to-code environment for backend, frontend, and docs.  
If you prefer, you can also set up your environment manually.

### Recommended: Devcontainer Setup

#### Initial Setup

1. **Install Prerequisites**
   - [Docker Desktop](https://docs.docker.com/get-docker/)
   - [Visual Studio Code](https://code.visualstudio.com/)
   - [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

1. **Clone the Repository Using VS Code**

    - Open Visual Studio Code.
    - Press <kbd>F1</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) to open the Command Palette.
    - Type and select `Git: Clone`.
    - Enter `https://github.com/CMLPlatform/relab` as the repository URL.
    - Choose a local folder for the clone.
    - When prompted, open the cloned repository.

1. **Configure Environment Variables**
   - Copy the example environment file for the backend:

     ```bash
     cp backend/.env.example backend/.env
     ```

   - Configure the necessary values in `backend/.env` (marked with 🔀).

#### Using Devcontainers

1. **Open Dev Container**
   - Open the repository in VS Code.
   - When prompted, click **"Reopen in Container"** in VS Code.
   - Alternatively, open the Command Palette again and select `Dev Containers: Reopen in Container`.

1. **Choose a Configuration**
   - Select a container for your task:

     | Configuration      | Purpose                 | Main Service(s) Start Command    |
     |--------------------|-------------------------|----------------------------------|
     | `relab-backend`    | Backend development     | `fastapi dev`                    |
     | `relab-frontend`   | Frontend development    | `npx expo start --web`           |
     | `relab-docs`       | Documentation           | MkDocs server auto-starts        |
     | `relab-fullstack`  | Fullstack development   | Both servers auto-start          |

1. **Service Ports**
   The following ports are forwarded to your local machine:
   - **Frontend:** [http://127.0.0.1:8010](http://127.0.0.1:8010)
   - **Backend:** [http://127.0.0.1:8011](http://127.0.0.1:8011)
   - **Docs:** [http://127.0.0.1:8012](http://127.0.0.1:8012)
   - **PostgreSQL:** `5433`

### Alternative: Local Development Setup

If you prefer not to use devcontainers, you can set up your environment manually.
You will need to install all dependencies (Python, Node, PostgreSQL, etc.) and run the services yourself.

#### Backend Setup

1. **Install Dependencies**
   - [uv (Python management tool)](https://docs.astral.sh/uv/getting-started/installation)
   - [PostgreSQL](https://pipenv.pypa.io/en/latest/install/). Make sure PostgreSQL is installed and running.

1. **Fork and clone the repository**:

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. **Install Python Dependencies**

   ```bash
   cd backend                  # Change to the backend directory
   uv sync                     # Install dependencies
   uv run pre-commit install   # Install pre-commit hooks
   ```

1. **Configure Environment**

   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   Configure the necessary values in `.env` (marked with 🔀).

   > 💡 Note: Make sure to create the PostgreSQL database and user as specified in your `.env` file.

1. **Run Setup Script**
   The [`local_setup.sh`](backend/local_setup.sh) script creates the database tables, runs the migrations, and sets up initial test data.

   **For Linux/macOS**: `./local_setup.sh`

   **For Windows**: It is recommended to use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or a Linux VM for development.

1. **Start the Application**

   Run the FastAPI server:

   ```bash
   fastapi dev
   ```

   The API is now available at <http://127.0.0.1:8000>.

   You can log in with the superuser details specified in the `.env` file. This gives you access to:

   - Interactive API documentation at <http://127.0.0.1:8000/swagger/full>
   - Admin panel for database management at <http://127.0.0.1:8000/dashboard>

#### Documentation Setup

You can use uv to manage the documentation dependencies and run the MkDocs server.

```bash
cd docs
uv run mkdocs serve
```

The documentation is now available at <http://127.0.0.1:8000> with live reload.

#### Frontend Setup

1. **Install dependencies**

   ```bash
   cd frontend
   npm install
   ```

1. **Start the app**

   ```bash
   npx expo start --web
   ```

   This will launch the Expo development server for the web frontend. By default, it opens [http://localhost:8081](http://localhost:8081) in your browser.  
   You can also use the Expo UI to run the app on a mobile device or emulator.

## Development Workflow

### Backend Development

#### Running the Application

Start the development server by navigating to the [`backend`](backend) directory and running the fastapi development server:

```bash
cd backend
uv run fastapi dev
```

The API will be available at <http://127.0.0.1:8000>.

#### Code Style Guidelines

We follow RESTful API design and the [Google Style Guide](https://google.github.io/styleguide/pyguide.html) for Python code, but use a line length of 120 characters.

We use several tools to ensure code quality:

1. [Ruff](https://docs.astral.sh/ruff/) for linting and code style enforcement (see [`pyproject.toml`](backend/pyproject.toml) for rules):

   ```bash
   uv run ruff check .
   uv run ruff format .
   ```

1. [Pyright](https://github.com/microsoft/pyright) for static type checking:

   ```bash
   uv run pyright
   ```

1. [Pre-commit](https://pre-commit.com/) hooks automatically run these checks and more before committing (see the [pre-commit configuration](backend/.pre-commit-config.yaml) for the full list of checks). You can check and format your code manually using:

   ```bash
   uv run pre-commit run --all-files
   ```

#### Testing

The project uses pytest for testing:

1. **Running Tests**

   ```bash
   uv run pytest
   ```

1. **Writing Tests**

   - Write unit tests for new functionality
   - Use fixtures for test setup
   - Mock external dependencies

#### Database Migrations

When making changes to the database schema:

1. **Create a Migration**

   ```bash
   uv run alembic revision --autogenerate -m "Description of changes"
   ```

1. **Review the Generated Migration**
   Review the migration file in `alembic/versions/` to ensure it correctly captures your changes.

1. **Apply the Migration**

   ```bash
   uv run alembic upgrade head
   ```

### Frontend Development

TODO: Add frontend development guidelines.

## Pull Request Process

1. **Fork and Create a Feature Branch**
   If not already done, [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) the repository and create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

1. **Make and Commit Changes**

   - Implement your feature or fix, following the [code style guidelines](#code-style-guidelines).

   - Use the [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/) format when committing changes:

     ```bash
     <type>(<scope>): <short summary>
     ```

     > 💡 Tip: You can use `uv run cz commit` to create conventional commits in the correct format.

1. **Submit Pull Request**

   - Push to your fork:

     ```bash
     git push origin feature/your-feature-name
     ```

   - Create a pull request against the main repository

   - Provide a clear description and reference related issues

   - Address review feedback

All contributions must pass automated checks and receive approval before merging.

## Project Structure

See the [online documentation]\](<https://docs.cml-relab.org/architecture/>) for an overview of the project's architecture and organization.

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [LICENSE](LICENSE).
