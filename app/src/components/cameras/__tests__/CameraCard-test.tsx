import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { resolveEffectiveCameraConnection } from '@/hooks/useEffectiveCameraConnection';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { renderWithProviders } from '@/test-utils/index';
import { CameraCard } from '../CameraCard';

const LAST_SEEN_PATTERN = /Last seen/;

// Stub out expo-image so we can query it by accessible content
jest.mock('expo-image', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source }: { source?: { uri?: string } }) =>
      React.createElement(Text, { testID: 'camera-thumbnail' }, `img:${source?.uri ?? ''}`),
  };
});

// TelemetryBadge makes an unrelated network hook call; stub it out.
jest.mock('@/components/cameras/TelemetryBadge', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TelemetryBadge: () => React.createElement(View, { testID: 'telemetry-badge' }),
  };
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeCamera(overrides: Partial<CameraReadWithStatus> = {}): CameraReadWithStatus {
  return {
    id: 'cam-1',
    name: 'Test Camera',
    description: '',
    preview_thumbnail_url: null,
    status: { connection: 'online', last_seen_at: null, details: null },
    telemetry: undefined,
    ...overrides,
  } as unknown as CameraReadWithStatus;
}

/** Returns an ISO timestamp that is `seconds` seconds in the past. */
function secsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('CameraCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Three-state visual distinction ────────────────────────────────────────

  it('online + preview_thumbnail_url: renders thumbnail, full opacity, "Online" chip', () => {
    const camera = makeCamera({ preview_thumbnail_url: 'https://example.com/preview.jpg' });

    const { UNSAFE_getByProps } = renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByTestId('camera-thumbnail')).toBeOnTheScreen();
    expect(screen.getByText('img:https://example.com/preview.jpg')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();

    // Card must NOT have the opacity:0.6 offline style
    const card = UNSAFE_getByProps({ accessibilityLabel: 'Camera: Test Camera' });
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style)
      : (card.props.style ?? {});
    expect(flatStyle.opacity).not.toBe(0.6);
    expect(flatStyle.maxWidth).toBe(420);
  });

  it('online + no stored preview: renders placeholder icon and preview caption', () => {
    const camera = makeCamera({ preview_thumbnail_url: null });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.queryByTestId('camera-thumbnail')).toBeNull();
    expect(screen.getByText('No preview available')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();
  });

  it('direct connection state still renders without needing snapshot queries', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: null, details: null },
    });

    renderWithProviders(
      <CameraCard
        camera={camera}
        effectiveConnection={resolveEffectiveCameraConnection(camera, {
          mode: 'local',
          localBaseUrl: 'http://192.168.7.1:8018',
          localMediaUrl: 'http://192.168.7.1:8888',
          localApiKey: null,
        })}
      />,
    );

    expect(screen.getByText('Online')).toBeOnTheScreen();
    expect(screen.getByText('Direct connection')).toBeOnTheScreen();
  });

  it('offline: card has opacity 0.6, "Offline" chip, "Last seen" text; no thumbnail even with preview_thumbnail_url', () => {
    const camera = makeCamera({
      preview_thumbnail_url: 'https://example.com/stale.jpg',
      status: { connection: 'offline', last_seen_at: secsAgo(120), details: null },
    });

    const { UNSAFE_getByProps } = renderWithProviders(<CameraCard camera={camera} />);

    // No thumbnail when offline
    expect(screen.queryByTestId('camera-thumbnail')).toBeNull();

    // "Last seen" subtext is rendered
    expect(screen.getByText(LAST_SEEN_PATTERN)).toBeOnTheScreen();

    // Telemetry badge NOT rendered when offline
    expect(screen.queryByTestId('telemetry-badge')).toBeNull();

    // Card wrapper has opacity: 0.6
    const card = UNSAFE_getByProps({ accessibilityLabel: 'Camera: Test Camera' });
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style)
      : (card.props.style ?? {});
    expect(flatStyle.opacity).toBe(0.6);
  });

  // ── formatLastSeen boundary cases ─────────────────────────────────────────

  it('formats last_seen_at = null as "never seen"', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: null, details: null },
    });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByText('Last seen never seen')).toBeOnTheScreen();
  });

  it('formats 30s ago as "30s ago"', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: secsAgo(30), details: null },
    });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByText('Last seen 30s ago')).toBeOnTheScreen();
  });

  it('formats 59s ago as "59s ago"', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: secsAgo(59), details: null },
    });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByText('Last seen 59s ago')).toBeOnTheScreen();
  });

  it('formats 60s (1m) ago as "1m ago"', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: secsAgo(60), details: null },
    });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByText('Last seen 1m ago')).toBeOnTheScreen();
  });

  it('formats 3600s (60m) ago as "1h ago"', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: secsAgo(3600), details: null },
    });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByText('Last seen 1h ago')).toBeOnTheScreen();
  });

  it('formats 86400s (24h) ago as "1d ago"', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: secsAgo(86400), details: null },
    });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByText('Last seen 1d ago')).toBeOnTheScreen();
  });

  it('formats 7 days ago as "7d ago"', () => {
    const camera = makeCamera({
      status: { connection: 'offline', last_seen_at: secsAgo(7 * 86400), details: null },
    });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByText('Last seen 7d ago')).toBeOnTheScreen();
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('accessibility label contains the camera name', () => {
    const camera = makeCamera({ name: 'Rooftop Cam' });

    renderWithProviders(<CameraCard camera={camera} />);

    expect(screen.getByLabelText('Camera: Rooftop Cam')).toBeOnTheScreen();
  });
});
