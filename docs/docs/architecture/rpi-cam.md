# RPI Camera Plugin Architecture

<div class="relab-section-intro">
An optional plugin that connects camera devices to RELab for remote capture, HLS preview streaming, and YouTube streaming. The backend acts as a proxy; the Expo app never talks to the device directly.
</div>

For platform-side setup and day-to-day usage, see the [RPI Camera User Guide](../user-guides/rpi-cam.md). For device installation and deployment, see the [RPI Camera Plugin repository](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

## System Diagram

```mermaid
graph TD
    Researcher[Researcher] -->|Capture workflow| FrontendApp[Expo App]
    FrontendApp -->|API requests| MainAPI[FastAPI Backend]

    MainAPI -->|Proxied requests + API key| RpiCamAPI[RPI Camera API]
    RpiCamAPI -->|Controls| Camera[Camera Hardware]

    RpiCamAPI -->|HLS preview stream| Researcher
    RpiCamAPI -->|Direct stream| YouTube[YouTube API]
    RpiCamAPI -->|Captured image + metadata| MainAPI

    GoogleOAuth[Google OAuth] -->|User tokens| MainAPI
    MainAPI -->|Livestream management| YouTube

    subgraph DataStores ["Data Stores"]
        Database[(PostgreSQL)]
        FileStorage[(File Storage)]
        Redis[(Redis)]
    end

    MainAPI -->|Store file metadata| Database
    MainAPI -->|Store captured images| FileStorage
    MainAPI -->|Recording session state| Redis
```

??? info "Styled diagram (ELK layout)"

    ```mermaid
    ---
    config:
        layout: elk
        elk:
            nodePlacementStrategy: LINEAR_SEGMENTS
    ---
    graph TD
        Researcher["fa:fa-flask Researcher"] -->|Capture workflow| FrontendApp["fa:fa-mobile-screen Expo App"]
        FrontendApp -->|API requests| MainAPI["fa:fa-bolt FastAPI Backend"]

        MainAPI -->|Proxied requests + API key| RpiCamAPI["fa:fa-microchip RPI Camera API"]
        RpiCamAPI -->|Controls| Camera["fa:fa-camera Camera Hardware"]

        RpiCamAPI -->|HLS preview stream| Researcher
        RpiCamAPI -->|Direct stream| YouTube["fa:fa-video YouTube API"]
        RpiCamAPI -->|Captured image + metadata| MainAPI

        GoogleOAuth["fa:fa-right-to-bracket Google OAuth"] -->|User tokens| MainAPI
        MainAPI -->|Livestream management| YouTube

        subgraph DataStores ["Data Stores"]
            Database[("fa:fa-database PostgreSQL")]
            FileStorage[("fa:fa-hard-drive File Storage")]
            Redis[("fa:fa-gauge-high Redis")]
        end

        MainAPI -->|Store file metadata| Database
        MainAPI -->|Store captured images| FileStorage
        MainAPI -->|Recording session state| Redis

        classDef actor fill:#e8f4f8,stroke:#2b6cb0,stroke-width:2px,color:#1a365d
        classDef frontend fill:#f0fff4,stroke:#276749,stroke-width:1.5px,color:#1a4731
        classDef backend fill:#fefcbf,stroke:#b7791f,stroke-width:2px,color:#5f4b0a
        classDef datastore fill:#e9d8fd,stroke:#6b46c1,stroke-width:1.5px,color:#44337a
        classDef external fill:#feebc8,stroke:#c05621,stroke-width:1.5px,color:#7b341e
        classDef hardware fill:#e2e8f0,stroke:#4a5568,stroke-width:2px,color:#1a202c

        class Researcher actor
        class FrontendApp frontend
        class MainAPI backend
        class Database,FileStorage,Redis datastore
        classDef auth fill:#fed7e2,stroke:#b83280,stroke-width:1.5px,color:#702459

        class YouTube external
        class GoogleOAuth auth
        class RpiCamAPI,Camera hardware
    ```

## Interaction Flow

```mermaid
sequenceDiagram
    participant Researcher
    participant App as Expo App
    participant Backend as Main Backend
    participant YouTubeAPI
    participant RPiCamAPI as Raspberry Pi API
    participant Camera as Camera Hardware

    %% Camera Registration
    Researcher->>App: Enter camera details
    App->>Backend: Register camera
    Backend->>Backend: Generate API key
    Backend-->>App: Return camera details & API key
    App-->>Researcher: Show connection details

    %% Image Capture Flow
    Researcher->>App: Request image capture
    App->>Backend: Request image capture
    Backend->>RPiCamAPI: Forward request with API key
    RPiCamAPI->>Camera: Control camera
    Camera->>RPiCamAPI: Image data
    RPiCamAPI-->>Backend: Image data & metadata
    Backend->>Backend: Store in database & link to product
    Backend-->>App: Return image
    App-->>Researcher: Show image

    %% YouTube Streaming Flow
    Researcher->>App: Start YouTube recording
    App->>Backend: Start YouTube recording
    Backend->>YouTubeAPI: Create live event (OAuth)
    YouTubeAPI-->>Backend: Stream key & broadcast info
    Backend->>RPiCamAPI: Start stream with YouTube config
    RPiCamAPI->>Camera: Start recording
    RPiCamAPI->>YouTubeAPI: Direct stream to YouTube
    Backend->>Backend: Save video record in database
    Backend-->>App: Return video details
    App-->>Researcher: Show video details

    %% Local Preview Stream
    Researcher->>App: Request preview stream
    App->>Backend: Request preview stream
    Backend->>RPiCamAPI: Start HLS stream
    RPiCamAPI->>Camera: Start streaming
    RPiCamAPI-->>Backend: Stream info
    Backend-->>App: Stream viewer URL
    App-->>Researcher: Open preview
    Researcher->>RPiCamAPI: Direct HLS requests
    RPiCamAPI-->>Researcher: Stream content

    %% Stop Streaming
    Researcher->>App: Stop recording or preview
    App->>Backend: Stop recording or preview
    Backend->>RPiCamAPI: Stop stream
    RPiCamAPI->>Camera: Stop camera
```

## Key Design Decisions

- **Backend as proxy**: All device communication goes through the main backend. The Expo app never contacts the camera directly, keeping auth and storage centralised.
- **API key per camera**: Each registered camera receives a unique key. The device uses this to authenticate inbound requests from the backend.
- **Media storage**: Captured images are stored in RELab's file storage and linked to the originating product or component record automatically.
- **Optional YouTube integration**: Streaming is mediated through the backend's OAuth connection to YouTube. The device streams directly to YouTube once authorised.
