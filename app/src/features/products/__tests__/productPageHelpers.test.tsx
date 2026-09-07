import { describe, expect, it } from '@jest/globals';
import { isValidElement } from 'react';
import { ActivityIndicator } from 'react-native';
import { Icon } from '@/components/base/Icon';
import { getPrimaryFabIcon } from '@/features/products/productPageHelpers';
import { getAppTheme } from '@/theme';

const theme = getAppTheme('light');

// getPrimaryFabIcon is a pure element factory, so assert on what it returns
// rather than rendering it: RNTL v14 renders host elements only, and both the
// glyph name and the component identity are lost by the time a tree exists.
function fabIcon(args: Omit<Parameters<typeof getPrimaryFabIcon>[0], 'theme'>) {
  const element = getPrimaryFabIcon({ ...args, theme });
  if (!isValidElement(element)) throw new Error('expected an element');
  return element as React.ReactElement<{ name?: string }>;
}

describe('getPrimaryFabIcon', () => {
  // Regression: a paused (offline, queued) save used to render the same
  // spinner as an actively in-flight save — an eternal spin with no end
  // state, since a paused mutation never resolves until connectivity returns.
  it('renders a clock, not a spinner, while saving is paused offline', () => {
    const element = fabIcon({
      isSaving: true,
      isPaused: true,
      showSavedIcon: false,
      editMode: true,
    });

    expect(element.type).toBe(Icon);
    expect(element.props.name).toBe('clock');
  });

  it('renders the spinner while actually saving (not paused)', () => {
    const element = fabIcon({
      isSaving: true,
      isPaused: false,
      showSavedIcon: false,
      editMode: true,
    });

    expect(element.type).toBe(ActivityIndicator);
  });

  it('renders the save icon when editing and idle', () => {
    const element = fabIcon({
      isSaving: false,
      isPaused: false,
      showSavedIcon: false,
      editMode: true,
    });

    expect(element.type).toBe(Icon);
    expect(element.props.name).toBe('save');
  });
});
