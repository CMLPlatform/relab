import { describe, expect, it } from '@jest/globals';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';
import IndexRoute from '@/app/index';

describe('index route', () => {
  it('redirects guests to /products', () => {
    renderRouter({
      index: IndexRoute,
      'products/index': () => <Text>Products route</Text>,
    });

    expect(screen.getByText('Products route')).toBeOnTheScreen();
  });
});
