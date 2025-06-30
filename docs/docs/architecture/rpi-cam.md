# Raspberry Pi Camera Plugin Architecture

The Raspberry Pi Camera Plugin enables integration between Raspberry Pi devices with cameras and the CML Reverse Engineering Lab platform. It provides a REST API for remote camera control, image capture, and video streaming to YouTube. See the [Raspberry Pi Camera Plugin User Guide](../user-guides/rpi-cam.md) for more details.

## System diagram

```mermaid
graph TD
    User[User fa:fa-user] -->|Interacts with fa:fa-hand-point-right| MainAPI[Main FastAPI Backend <i class="fa fa-server" style="color:#43a047;"></i>]

    MainAPI -->|API Requests fa:fa-arrow-right|RpiCamAPI[Raspberry Pi Camera API <i class="fab fa-raspberry-pi" style="color:#e91e63;"></i>]
    RpiCamAPI -->|Controls fa:fa-microchip| Camera[Camera Hardware fa:fa-camera-retro]

    RpiCamAPI -->|"Stream (HLS) fa:fa-play-circle"| User
    RpiCamAPI -->|Stream fa:fa-play-circle| YouTube[YouTube API <i class="fab fa-youtube" style="color:#ff0000;"></i>]
    RpiCamAPI -->|Image Capture fa:fa-image| MainAPI
    MainAPI -->|Youtube Integration fa:fa-sign-in-alt| YouTube

    MainAPI -->|Link to Database fa:fa-database| Database[(PostgreSQL <i class="fa fa-database" style="color:#1976d2;"></i>)]

    style User fill:#ffe0b2,stroke:#ff9800,stroke-width:2px;
    style MainAPI fill:#ccebc5,stroke:#43a047,stroke-width:2px;
    style RpiCamAPI fill:#f8bbd0,stroke:#e91e63,stroke-width:2px;
    style Camera fill:#fff9c4,stroke:#fdd835,stroke-width:2px;
    style YouTube fill:#ffe6e6,stroke:#ff0000,stroke-width:2px;
    style Database fill:#bbdefb,stroke:#1976d2,stroke-width:2px;
```

## Interaction flow diagram

```mermaid
sequenceDiagram
    participant User
    participant Backend as Main Backend
    participant YouTubeAPI
    participant RPiCamAPI as Raspberry Pi API
    participant Camera as Camera Hardware

    %% Camera Registration
    User->>Backend: Register camera
    Backend->>Backend: Generate API key
    Backend-->>User: Return camera details & API key

    %% Image Capture Flow
    User->>Backend: Request image capture
    Backend->>RPiCamAPI: Forward request with API key
    RPiCamAPI->>Camera: Control camera
    Camera->>RPiCamAPI: Image data
    RPiCamAPI-->>Backend: Image data & metadata
    Backend->>Backend: Store in database & link to product
    Backend-->>User: Return image

    %% YouTube Streaming Flow
    User->>Backend: Start YouTube recording
    Backend->>YouTubeAPI: Create live event (OAuth)
    YouTubeAPI-->>Backend: Stream key & broadcast info
    Backend->>RPiCamAPI: Start stream with YouTube config
    RPiCamAPI->>Camera: Start recording
    RPiCamAPI->>YouTubeAPI: Direct stream to YouTube
    Backend->>Backend: Save video record in database
    Backend-->>User: Return video details

    %% Local Preview Stream
    User->>Backend: Request preview stream
    Backend->>RPiCamAPI: Start HLS stream
    RPiCamAPI->>Camera: Start streaming
    RPiCamAPI-->>Backend: Stream info
    Backend-->>User: Stream viewer URL
    User->>RPiCamAPI: Direct HLS requests
    RPiCamAPI-->>User: Stream content

    %% Stop Streaming
    User->>Backend: Stop recording/preview
    Backend->>RPiCamAPI: Stop stream
    RPiCamAPI->>Camera: Stop camera
```
