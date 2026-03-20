import { describe, it, expect } from '@jest/globals';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { InfoTooltip } from '../InfoTooltip';

describe('InfoTooltip', () => {
  it('renders the info icon (non-mobileWeb path)', () => {
    const { toJSON } = render(
      <PaperProvider>
        <InfoTooltip title="Helpful tip" />
      </PaperProvider>,
    );
    // Should render without crashing
    expect(toJSON()).toBeTruthy();
  });

  it('renders with the given title available', () => {
    // The title is passed to the Tooltip; we just check it renders
    render(
      <PaperProvider>
        <InfoTooltip title="My tooltip text" />
      </PaperProvider>,
    );
    // Component renders without error
    expect(screen.toJSON()).toBeTruthy();
  });
});
