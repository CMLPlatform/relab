import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import ProductsTab from '../products';
import * as auth from '@/services/api/authentication';
import * as fetching from '@/services/api/fetching';
import { renderWithProviders, mockUser } from '@/test-utils';

jest.mock('@/services/api/authentication', () => ({
  getUser: jest.fn(),
}));

jest.mock('@/services/api/fetching', () => ({
  allProducts: jest.fn(),
  myProducts: jest.fn(),
}));

jest.mock('@/components/common/ProductCard', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ product }: { product: { name: string } }) => React.createElement(Text, null, product.name);
});

const mockPush = jest.fn();

const makeProduct = (id: number, name: string) => ({
  id,
  name,
  description: '',
  productTypeID: undefined,
  componentIDs: [],
  physicalProperties: { weight: 1, width: 1, height: 1, depth: 1 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'testuser',
});

describe('ProductsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
    (auth.getUser as jest.Mock).mockResolvedValue(mockUser);
    (fetching.allProducts as jest.Mock).mockResolvedValue([]);
    (fetching.myProducts as jest.Mock).mockResolvedValue([]);
  });

  it('shows filter buttons and search bar', async () => {
    renderWithProviders(<ProductsTab />, { withDialog: true });
    expect(screen.getByText('All Products')).toBeTruthy();
    expect(screen.getByText('My Products')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search products by name or description')).toBeTruthy();
  });

  it('shows empty state when no products', async () => {
    (fetching.allProducts as jest.Mock).mockResolvedValue([]);
    renderWithProviders(<ProductsTab />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText('No products yet. Create your first one!')).toBeTruthy();
    });
  });

  it('renders products in the list', async () => {
    (fetching.allProducts as jest.Mock).mockResolvedValue([makeProduct(1, 'Widget A'), makeProduct(2, 'Widget B')]);
    renderWithProviders(<ProductsTab />, { withDialog: true });
    await waitFor(() => {
      expect(screen.getByText('Widget A')).toBeTruthy();
      expect(screen.getByText('Widget B')).toBeTruthy();
    });
  });

  it('filters products by search query', async () => {
    (fetching.allProducts as jest.Mock).mockResolvedValue([makeProduct(1, 'Widget A'), makeProduct(2, 'Gadget B')]);
    renderWithProviders(<ProductsTab />, { withDialog: true });
    await screen.findByText('Widget A');

    fireEvent.changeText(screen.getByPlaceholderText('Search products by name or description'), 'widget');
    await waitFor(() => {
      expect(screen.getByText('Widget A')).toBeTruthy();
      expect(screen.queryByText('Gadget B')).toBeNull();
    });
  });

  it("shows 'no matches' empty state when search has no results", async () => {
    (fetching.allProducts as jest.Mock).mockResolvedValue([makeProduct(1, 'Widget A')]);
    renderWithProviders(<ProductsTab />, { withDialog: true });
    await screen.findByText('Widget A');

    fireEvent.changeText(screen.getByPlaceholderText('Search products by name or description'), 'zzznomatch');
    await waitFor(() => {
      expect(screen.getByText('No products found matching your search.')).toBeTruthy();
    });
  });

  it('shows verification alert when unverified user presses New Product', async () => {
    (auth.getUser as jest.Mock).mockResolvedValue({ ...mockUser, isVerified: false });
    renderWithProviders(<ProductsTab />, { withDialog: true });
    await screen.findByText('All Products');

    fireEvent.press(screen.getByText('New Product'));
    await waitFor(() => {
      expect(screen.getByText('Email Verification Required')).toBeTruthy();
    });
  });

  it('shows create product dialog for verified user pressing New Product', async () => {
    renderWithProviders(<ProductsTab />, { withDialog: true });
    await screen.findByText('All Products');

    fireEvent.press(screen.getByText('New Product'));
    await waitFor(() => {
      expect(screen.getByText('Create New Product')).toBeTruthy();
    });
  });

  it("shows 'mine' empty state when filter is My Products", async () => {
    (fetching.myProducts as jest.Mock).mockResolvedValue([]);
    renderWithProviders(<ProductsTab />, { withDialog: true });
    await screen.findByText('No products yet. Create your first one!');

    fireEvent.press(screen.getByText('My Products'));
    await waitFor(() => {
      expect(screen.getByText("You haven't created any products yet. Create your first one!")).toBeTruthy();
    });
  });
});
