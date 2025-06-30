# API Structure

The platform provides a RESTful API that allows interaction with the backend services. The API is built using FastAPI and follows standard REST principles. It supports authentication, data collection, media management, and hardware integration. For complete API reference, visit the [interactive documentation](https://cml-relab.org/docs).

## Core Endpoints

### Authentication

- `/auth/*` - Login, logout, OAuth, and user management

### Data Collection

- `/products` - Products and components

### Reference Data

- `/background-data/*` - Taxonomies, categories, materials, product types

### Media Management

- `/file-storage/*` - Images, videos, and file uploads

### Hardware Integration

- `/plugins/rpi-cam/*` - Raspberry Pi camera control and streaming

## Interaction flow diagram

```mermaid
sequenceDiagram
    participant User
    participant API as FastAPI Backend
    participant DB as Database
    participant Storage as File Storage
    participant RPI as RPI Camera API

    User->>API: Authenticate
    API-->>User: Access Token

    loop Add Products
        User->>API: Create Parent Product
        API->>DB: Store Product
        API-->>User: Product Details

        opt Capture Product Images
            User->>API: Request Image Capture
            API->>RPI: Trigger Camera
            RPI-->>API: Image Data
            API->>Storage: Store Image
            API->>DB: Link to Product
            API-->>User: Image Details
        end

        loop Add Components
            User->>API: Create Component (Child Product)
            API->>DB: Store Component
            API->>DB: Link Component to Parent
            API-->>User: Component Details
        end
    end
```
