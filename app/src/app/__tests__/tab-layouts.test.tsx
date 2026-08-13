import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import type React from 'react';
import AccountTabLayout from '@/app/(tabs)/(account)/_layout';
import CamerasTabLayout from '@/app/(tabs)/(cameras)/_layout';
import ProductsTabLayout from '@/app/(tabs)/(products)/_layout';

// Populated by the Stack.Screen mock with each screen's `name` -> `options`,
// keyed fresh on every render. 'mock'-prefixed names are exempt from
// babel-jest's hoisting TDZ check, so the factory can close over it.
const mockScreenOptions: Record<string, Record<string, unknown> | undefined> = {};
const mockNavigate = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const ReactActual = require('react');
  function StackScreenMock({ name, options }: { name: string; options?: Record<string, unknown> }) {
    mockScreenOptions[name] = options;
    return null;
  }
  function StackMock({ children }: { children?: React.ReactNode }) {
    return ReactActual.createElement(ReactActual.Fragment, null, children);
  }
  StackMock.Screen = StackScreenMock;
  return {
    Stack: StackMock,
    useRouter: () => ({ navigate: mockNavigate, replace: mockReplace }),
  };
});

const mockUseBreakpoint = jest.fn();
jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}));

jest.mock('@/context/themeMode', () => ({
  useEffectiveColorScheme: () => 'light',
}));

beforeEach(() => {
  for (const key of Object.keys(mockScreenOptions)) delete mockScreenOptions[key];
  jest.clearAllMocks();
  mockUseBreakpoint.mockReturnValue({ isLg: false });
});

describe('tab stack layouts', () => {
  // Each tab owns its own stack now, so hideForTopNav lives in three places
  // instead of one. TopNav covers the three tab roots on >=lg web; every
  // deeper screen keeps its header at any width.
  it('hides only the TopNav-covered tab roots, and only at lg', () => {
    render(
      <>
        <ProductsTabLayout />
        <CamerasTabLayout />
        <AccountTabLayout />
      </>,
    );

    expect(mockScreenOptions['products/index']?.headerShown).toBe(true);
    expect(mockScreenOptions['cameras/index']?.headerShown).toBe(true);
    expect(mockScreenOptions['account/index']?.headerShown).toBe(true);
    expect(mockScreenOptions['cameras/add']?.headerShown).toBeUndefined();
    expect(mockScreenOptions['cameras/[id]']?.headerShown).toBeUndefined();
    expect(mockScreenOptions['products/new']?.headerShown).toBeUndefined();

    mockUseBreakpoint.mockReturnValue({ isLg: true });
    render(
      <>
        <ProductsTabLayout />
        <CamerasTabLayout />
        <AccountTabLayout />
      </>,
    );

    expect(mockScreenOptions['products/index']?.headerShown).toBe(false);
    expect(mockScreenOptions['cameras/index']?.headerShown).toBe(false);
    expect(mockScreenOptions['account/index']?.headerShown).toBe(false);
    expect(mockScreenOptions['cameras/add']?.headerShown).toBeUndefined();
  });

  // The products tab owns the /components tree too, so a component's creation
  // screen has to be declared here rather than on the root stack.
  it('keeps both the products and components trees in the products tab', () => {
    render(<ProductsTabLayout />);

    expect(mockScreenOptions['products/[id]/components/new']?.title).toBe('New component');
    expect(mockScreenOptions['components/[id]/components/new']?.title).toBe('New component');
  });

  // A replace from the account tab to the products tab resolves above the tab
  // navigator and swaps the whole thing out, resetting every tab's trail.
  it('leaves the account tab by navigating, never replacing', () => {
    render(<AccountTabLayout />);
    const headerLeft = mockScreenOptions['account/index']?.headerLeft as (props: object) => {
      props: { onPress: () => void };
    };

    headerLeft({}).props.onPress();

    expect(mockNavigate).toHaveBeenCalledWith('/products');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // The cameras back arrow targets its own stack, so a replace stays inside
  // the tab — no other trail is touched.
  it('keeps the cameras back arrow a same-stack replace', () => {
    render(<CamerasTabLayout />);
    const headerLeft = mockScreenOptions['cameras/add']?.headerLeft as (props: object) => {
      props: { onPress: () => void };
    };

    headerLeft({}).props.onPress();

    expect(mockReplace).toHaveBeenCalledWith('/cameras');
  });
});
