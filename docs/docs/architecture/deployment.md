# Deployment and Operations

An overview of how the platform is hosted, tested, and maintained.

## Hosting and Backups

- **Hosting**: Currently deployed on a self-hosted server using Docker Compose.
- **Backups**: PostgreSQL data and user-uploaded files are backed up to the cloud daily.

## CI/CD and Testing

- **Testing**: Backend tests are mostly implemented. The `frontend-app` has a testing skeleton in place. Tests run via GitHub Actions (`.github/workflows/testing.yml`).
- **Dependencies**: Automated using `renovate.json`.
- **Security**: CodeQL analysis runs automatically on merges to `main`.
- **Deployment**: Currently manual. Continuous Deployment (CD) is not yet configured.

## Future Plans

- Configure automated Continuous Deployment (CD).
- Setup automated version management and changelogs.
- Improve secrets management for production environments.
