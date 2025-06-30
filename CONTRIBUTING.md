# Contributing to Reverse Engineering Lab

Thank you for your interest in contributing to the Reverse Engineering Lab project! This guide will help you get started with the development process and outline our expectations for contributions.

## Overview

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development Setup](#local-development-setup)
- [Development Workflow](#development-workflow)
  - [Running the Application](#running-the-application)
  - [Code Style Guidelines](#code-style-guidelines)
  - [Testing](#testing)
  - [Database Migrations](#database-migrations)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [License](#license)

## Code of Conduct

By participating in this project, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Getting Started

### Prerequisites

For local development, you will need the following tools:

- [uv (Python management tool)](https://docs.astral.sh/uv/getting-started/installation)
- A running [PostgreSQL](https://pipenv.pypa.io/en/latest/install/) service.

### Local Development Setup

1. **Fork and clone the repository**:

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. **Install Development Dependencies**

   ```bash
   cd backend                  # Change to the backend directory
   uv sync                     # Install dependencies
   uv run pre-commit install   # Install pre-commit hooks
   ```

1. Set up the app by following the [Installation Guide](INSTALL.md#local-setup) (skip dependencies installation as you've done this in the step above).

## Development Workflow

### Running the Application

Start the development server by navigating to the [`backend`](backend) directory and running the fastapi development server:

```bash
cd backend
uv run fastapi dev app/main.py
```

The API will be available at <http://127.0.0.1:8000>.

### Code Style Guidelines

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

### Testing

The project uses pytest for testing:

1. **Running Tests**

   ```bash
   uv run pytest
   ```

1. **Writing Tests**

   - Write unit tests for new functionality
   - Use fixtures for test setup
   - Mock external dependencies

### Database Migrations

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
