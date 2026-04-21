import { render, screen } from '@testing-library/react-native';
import type { CameraTelemetry } from '@/services/api/rpiCamera';
import { renderWithProviders } from '@/test-utils/index';
import { TelemetryBadge } from '../TelemetryBadge';

const TEMPERATURE_PATTERN = /°C/;
const LIVE_PATTERN = /live/;

const baseTelemetry: CameraTelemetry = {
  timestamp: '2024-01-01T00:00:00Z',
  cpu_temp_c: 55,
  cpu_percent: 10,
  mem_percent: 30,
  disk_percent: 20,
  preview_fps: null,
  preview_sessions: 0,
  thermal_state: 'normal',
  current_preview_size: null,
};

describe('TelemetryBadge', () => {
  it('returns null when telemetry is null', () => {
    const { toJSON } = render(<TelemetryBadge telemetry={null} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when telemetry is undefined', () => {
    const { toJSON } = render(<TelemetryBadge telemetry={undefined} />);
    expect(toJSON()).toBeNull();
  });

  it('shows only the state label when cpu_temp_c is null', () => {
    renderWithProviders(
      <TelemetryBadge
        telemetry={{ ...baseTelemetry, cpu_temp_c: null, thermal_state: 'normal' }}
      />,
    );
    expect(screen.getByText('Normal')).toBeOnTheScreen();
    expect(screen.queryByText(TEMPERATURE_PATTERN)).toBeNull();
  });

  it('shows temperature and state label when cpu_temp_c is provided', () => {
    renderWithProviders(
      <TelemetryBadge telemetry={{ ...baseTelemetry, cpu_temp_c: 67.4, thermal_state: 'warm' }} />,
    );
    expect(screen.getByText('67°C · Warm')).toBeOnTheScreen();
  });

  it.each([
    ['normal', 'Normal'],
    ['warm', 'Warm'],
    ['throttle', 'Throttle'],
    ['critical', 'Critical'],
  ] as const)('renders the %s thermal state correctly', (state, label) => {
    renderWithProviders(
      <TelemetryBadge telemetry={{ ...baseTelemetry, cpu_temp_c: 55, thermal_state: state }} />,
    );
    expect(screen.getByText(`55°C · ${label}`)).toBeOnTheScreen();
  });

  it('shows live session count when preview_sessions > 0', () => {
    renderWithProviders(<TelemetryBadge telemetry={{ ...baseTelemetry, preview_sessions: 2 }} />);
    expect(screen.getByText('2 live')).toBeOnTheScreen();
  });

  it('does not show live count when preview_sessions is 0', () => {
    renderWithProviders(<TelemetryBadge telemetry={{ ...baseTelemetry, preview_sessions: 0 }} />);
    expect(screen.queryByText(LIVE_PATTERN)).toBeNull();
  });
});
