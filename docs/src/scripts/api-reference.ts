import { createApiReference } from '@scalar/api-reference';
import '@scalar/api-reference/style.css';

const container = document.getElementById('api-reference');

if (container instanceof HTMLElement) {
  const schemaUrl = container.dataset.schemaUrl;
  const backendApiUrl = container.dataset.backendApiUrl;

  if (schemaUrl && backendApiUrl) {
    createApiReference(container, {
      agent: {
        disabled: true,
        hideAddApi: true,
      },
      baseServerURL: backendApiUrl,
      documentDownloadType: 'direct',
      hideClientButton: true,
      persistAuth: false,
      showDeveloperTools: 'never',
      servers: [{ url: backendApiUrl }],
      telemetry: false,
      url: schemaUrl,
    });
  }
}
