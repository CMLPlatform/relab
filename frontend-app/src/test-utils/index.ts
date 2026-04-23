// Re-export everything from @testing-library/react-native so tests can import
// from a single location and get the custom render alongside standard queries.
// biome-ignore lint/performance/noBarrelFile: this test-only facade intentionally centralizes testing utilities.
// biome-ignore lint/performance/noReExportAll: test helpers intentionally mirror RTL's public surface.
export * from '@testing-library/react-native';
export { mockResponse, mockUser, setupFetchMock } from './api-mocks';
export { baseProduct } from './fixtures';
export { mockPlatform, restorePlatform } from './platform';
export { renderWithProviders } from './render';
export { handlers, server } from './server';
export { setupUser } from './user-event';
