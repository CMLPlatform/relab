# Authentication

The authentication system uses [FastAPI-Users](https://fastapi-users.github.io/fastapi-users/latest/) with support for both bearer token and cookie-based authentication. It also supports OAuth integration for Google and GitHub accounts.

```mermaid
sequenceDiagram
    participant User
    participant API
    participant AuthBackend
    participant OAuthProvider

    User->>API: Login Request
    alt Password Auth
        API->>AuthBackend: Validate Credentials
        AuthBackend->>API: Generate JWT/Cookie
        API->>User: Return Token/Set Cookie
    else OAuth
        API->>OAuthProvider: Redirect to Provider
        User->>OAuthProvider: Authenticate
        OAuthProvider->>API: Authorization Code
        API->>OAuthProvider: Exchange for Token
        API->>AuthBackend: Create/Update User
        API->>User: Return Token/Set Cookie
    end
```

For an overview of the relevant API endpoints, visit the [interactive documentation](https://api.cml-relab.org/docs#tag/auth).
