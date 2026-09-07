import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import { Icon } from '@/components/base/Icon';
import { getPrimaryFabIcon } from '@/features/products/productPageHelpers';
import { getAppTheme } from '@/theme';

const theme = getAppTheme('light');

describe('getPrimaryFabIcon', () => {
  // Regression: a paused (offline, queued) save used to render the same
  // spinner as an actively in-flight save — an eternal spin with no end
  // state, since a paused mutation never resolves until connectivity returns.
  it('renders a clock, not a spinner, while saving is paused offline', () => {
    const { UNSAFE_root } = render(
      getPrimaryFabIcon({
        isSaving: true,
        isPaused: true,
        showSavedIcon: false,
        editMode: true,
        theme,
      }),
    );
    expect(UNSAFE_root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(UNSAFE_root.findAllByType(Icon)).toHaveLength(1);
    expect(UNSAFE_root.findAllByType(Icon)[0]?.props.name).toBe('clock');
  });

  it('renders the spinner while actually saving (not paused)', () => {
    const { UNSAFE_root } = render(
      getPrimaryFabIcon({
        isSaving: true,
        isPaused: false,
        showSavedIcon: false,
        editMode: true,
        theme,
      }),
    );
    expect(UNSAFE_root.findAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('renders the save icon when editing and idle', () => {
    const { UNSAFE_root } = render(
      getPrimaryFabIcon({
        isSaving: false,
        isPaused: false,
        showSavedIcon: false,
        editMode: true,
        theme,
      }),
    );
    expect(UNSAFE_root.findAllByType(Icon)[0]?.props.name).toBe('save');
  });
});
