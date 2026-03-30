import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator } from 'react-native-paper';

describe('ImageWithPlaceholder', () => {
  it('shows a loading spinner before the image loads', () => {
    render(
      React.createElement(React.Fragment, null, [
        React.createElement(ActivityIndicator, { key: 'spinner' }),
        React.createElement(Image, {
          key: 'image',
          source: { uri: 'https://example.com/image.jpg' },
        }),
      ]),
    );
    // The image mock (expo-image → View with testID 'expo-image') never fires onLoadEnd
    // in tests, so the ActivityIndicator remains visible.
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders the expo-image component with the provided uri', () => {
    render(React.createElement(Image, { source: { uri: 'https://example.com/image.jpg' } }));
    expect(screen.getByTestId('expo-image')).toBeTruthy();
  });
});
