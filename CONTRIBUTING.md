# Contributing to Reverse Engineering Lab

Thank you for your interest in contributing to the Reverse Engineering Lab project! This guide will help you get started with the development process and outline our expectations for contributions.

## Overview

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Recommended: Devcontainer Setup](#recommended-devcontainer-setup)
    - [Initial Setup](#initial-setup)
    - [Using Devcontainers](#using-devcontainers)
  - [Alternative: Local Development Setup](#alternative-local-development-setup)
    - [Root Setup](#root-setup)
    - [Backend Setup](#backend-setup)
    - [Documentation Setup](#documentation-setup)
    - [Frontend Setup](#frontend-setup)
- [Development Workflow](#development-workflow)
  - [Pull Request Process](#pull-request-process)
  - [Backend Development](#backend-development)
    - [Backend Code Style](#backend-code-style)
    - [Backend Testing](#backend-testing)
    - [Database Migrations](#database-migrations)
  - [Frontend Development](#frontend-development)
    - [Frontend Code Style](#frontend-code-style)
    - [Frontend Testing](#frontend-testing)
  - [Docs Development](#docs-development)
  - [Documentation Style](#documentation-style)
- [License](#license)

## Code of Conduct

By participating in this project, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Getting Started

If you’re new, start with the [Architecture Documentation](https://docs.cml-relab.org/architecture/) for an overview of the project structure.

We recommend using [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers) for development, as this provides a consistent, ready-to-code environment for backend, frontend, and docs.

If you prefer, you can also set up your [environment manually](#alternative-local-development-setup).

### Recommended: Devcontainer Setup

#### Initial Setup

1. **Install Prerequisites**

   - [VS Code](https://code.visualstudio.com/)
   - [Docker Desktop](https://docs.docker.com/get-docker/)
   - [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

1. **Clone the Repository Using VS Code**

   - Open VS Code.
   - Press <kbd>F1</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) to open the Command Palette.
   - Type and select `Git: Clone`.
   - Enter `https://github.com/CMLPlatform/relab` as the repository URL.
   - Choose a local folder for the clone.
   - When prompted, open the cloned repository.

1. **Install linting and formatting tools**

   ```bash
   uv run pre-commit install
   ```

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

     | Configuration     | Purpose               | Main Service(s) Start Command |
     | ----------------- | --------------------- | ----------------------------- |
     | `relab-backend`   | Backend development   | `fastapi dev`                 |
     | `relab-frontend`  | Frontend development  | `npx expo start --web`        |
     | `relab-docs`      | Documentation         | MkDocs server auto-starts     |
     | `relab-fullstack` | Fullstack development | Both servers auto-start       |

1. **Service Ports**
   The following ports are forwarded to your local machine:

   - **Frontend:** [http://127.0.0.1:8010](http://127.0.0.1:8010)
   - **Backend:** [http://127.0.0.1:8011](http://127.0.0.1:8011)
   - **Docs:** [http://127.0.0.1:8012](http://127.0.0.1:8012)
   - **PostgreSQL:** `5433`

### Alternative: Local Development Setup

If you prefer not to use devcontainers, you can set up your environment manually.

You will need to install all dependencies (Python, Node, PostgreSQL, etc.) and run the services yourself.

It is still recommended to use VS Code as your IDE, as we have provided some recommended extensions and settings in the `.vscode` folders.

#### Root Setup

1. **Install Prerequisites**

   - [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
   - [uv](https://docs.astral.sh/uv/getting-started/installation)

1. **Fork and clone the repository**:

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. **Install linting and formatting tools**

   ```bash
   uv run pre-commit install
   ```

#### Backend Setup

1. **Install Dependencies**

   - [uv](https://docs.astral.sh/uv/getting-started/installation) (should have been installed in the root setup)
   - [PostgreSQL](https://pipenv.pypa.io/en/latest/install/). Make sure PostgreSQL is installed and running.

1. **Install Python Dependencies**

   ```bash
   cd backend  
   uv sync  
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

You can use `uv` to manage the documentation dependencies and run the MkDocs server.

```bash
cd docs
uv run mkdocs serve
```

The documentation is now available at <http://127.0.0.1:8000> with live reload.

#### Frontend Setup

1. **Install Dependencies**

   - [Node.js](https://nodejs.org/en/download/) (LTS version recommended)
   - [Expo](https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local) for your target platform (Android/iOS, device/simulator).
     - Select **Development build**, disable **Build with EAS**, and follow the setup steps for your platform.

1. **Install Node.js Packages**

   ```bash
   cd frontend
   npm install
   ```

1. **Start the app**

   ```bash
   npx expo start --web
   ```

   This will launch the Expo development server for the web frontend. By default, it opens [http://localhost:8081](http://localhost:8081) in your browser.

   > 💡 Note: You can also use the Expo UI to run the app on a mobile device or emulator, see the [official Expo documentation](https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local) for details.

## Development Workflow

This section explains how to contribute to Reverse Engineering Lab, including proposing changes, submitting pull requests, and following our development guidelines for backend, frontend, and documentation.

If you’re new, start with the [Architecture Documentation](https://docs.cml-relab.org/architecture/) for an overview of the project structure.

### Pull Request Process

1. **Fork and Create a Feature Branch**
   If not already done, [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) the repository and create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

1. **Make and Commit Changes**

   - Implement your feature or fix, following the [code style guidelines](#code-style-guidelines).

   - [Pre-commit](https://pre-commit.com/) hooks will automatically check and format your code before each commit.\
     You can also run all checks manually:

     ```bash
     uv run pre-commit run --all-files
     ```

     > 💡 Tip: Make sure you have installed the pre-commit hooks by running `uv run pre-commit install` in the project root directory.

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

### Backend Development

Set up your environment as described in the [Getting Started](#getting-started) section.

You can run the development server with:

```bash
fastapi dev
```

The API will be available at <http://localhost:8000>, or <http://localhost:8011> when using a devcontainer.

#### Backend Code Style

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

#### Backend Testing

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

   - For docker setups, run the migration service:

   ```bash
   docker compose up backend_migrations
   ```

   - For local setups, run:

   ```bash
   uv run alembic upgrade head
   ```

### Frontend Development

Set up your environment as described in the [Getting Started](#getting-started) section.

You can run the development server with:

```bash
npx expo start --web
```

The app will be available at <http://localhost:8081>, or <http://localhost:8010> when using a devcontainer.

#### Frontend Code Style

- Code should be formatted with Prettier and checked with ESLint (run `npm run lint` and `npm run format`).
- Use [React Native Paper](https://callstack.github.io/react-native-paper/) components where possible for UI consistency.
- Follow the existing folder structure and naming conventions.

#### Frontend Testing

- Write unit tests for new components and features.
- Follow the [Expo testing guidelines](https://docs.expo.dev/develop/unit-testing/).
- Run tests with `npm run test` before submitting a pull request.

### Docs Development

Set up your environment as described in the [Getting Started](#getting-started) section.

You can run the MkDocs server with:

```bash
uv run mkdocs serve
```

The docs will be available at <http://localhost:8000>, or <http://localhost:8012> when using a devcontainer.

### Documentation Style

- Write docs in clear, concise English and follow the existing tone.
- Prefer [GitHub-flavored Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) and [Mermaid](https://mermaid-js.github.io/) for diagrams.
- Avoid raw HTML unless absolutely necessary.
- Format markdown with `mdformat` (see [.pre-commit-config.yaml](.pre-commit-config.yaml) for the configuration).
- Refer to the [MkDocs](https://www.mkdocs.org/) and [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) documentation to see available features and best practices.

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [LICENSE](LICENSE).
