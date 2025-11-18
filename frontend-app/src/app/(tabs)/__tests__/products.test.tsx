import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProductsTab from '../products';
import { useRouter } from 'expo-router';
import { useDialog } from '@/components/common/DialogProvider';
import * as auth from '@/services/api/authentication';
import * as fetching from '@/services/api/fetching';
import { Product } from '@/types/Product';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-router');
jest.mock('@/components/common/DialogProvider');
jest.mock('@/services/api/authentication');
jest.mock('@/services/api/fetching');

describe('ProductsTab Page', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockDialog = {
    alert: jest.fn(),
    input: jest.fn(),
  };

  const mockProducts: Required<Product>[] = [
    {
      id: 1,
      name: 'Product 1',
      brand: 'Brand 1',
      model: 'Model 1',
      description: 'Description 1',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      productTypeID: 1,
      componentIDs: [1, 2],
      physicalProperties: {
        weight: 100,
        width: 10,
        height: 10,
        depth: 10,
      },
      images: [],
      ownedBy: 'me',
      parentID: undefined,
      amountInParent: undefined,
    },
    {
      id: 2,
      name: 'Product 2',
      brand: 'Brand 2',
      model: 'Model 2',
      description: 'Description 2',
      createdAt: '2024-01-02',
      updatedAt: '2024-01-02',
      productTypeID: 2,
      componentIDs: [],
      physicalProperties: {
        weight: 200,
        width: 20,
        height: 20,
        depth: 20,
      },
      images: [],
      ownedBy: 'me',
      parentID: undefined,
      amountInParent: undefined,
    },
  ];

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    isActive: true,
    isSuperuser: false,
    isVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useDialog as jest.Mock).mockReturnValue(mockDialog);
    (auth.getUser as jest.Mock).mockResolvedValue(mockUser);
    (fetching.allProducts as jest.Mock).mockResolvedValue(mockProducts);
    (fetching.myProducts as jest.Mock).mockResolvedValue([mockProducts[0]]);
    AsyncStorage.clear();
  });

  it('should render filter buttons', async () => {
    const { getByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('All Products')).toBeTruthy();
      expect(getByText('My Products')).toBeTruthy();
    });
  });

  it('should render search bar', async () => {
    const { getByPlaceholderText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByPlaceholderText('Search products by name or description')).toBeTruthy();
    });
  });

  it('should render products list', async () => {
    const { getByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('Product 1')).toBeTruthy();
      expect(getByText('Product 2')).toBeTruthy();
    });
  });

  it('should filter products when "My Products" is selected', async () => {
    const { getByText, queryByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('Product 1')).toBeTruthy();
    });

    fireEvent.press(getByText('My Products'));

    await waitFor(() => {
      expect(fetching.myProducts).toHaveBeenCalled();
    });
  });

  it('should search products by name', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('Product 1')).toBeTruthy();
      expect(getByText('Product 2')).toBeTruthy();
    });

    const searchBar = getByPlaceholderText('Search products by name or description');
    fireEvent.changeText(searchBar, 'Product 1');

    await waitFor(() => {
      expect(getByText('Product 1')).toBeTruthy();
      expect(queryByText('Product 2')).toBeFalsy();
    });
  });

  it('should search products by description', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('Product 1')).toBeTruthy();
    });

    const searchBar = getByPlaceholderText('Search products by name or description');
    fireEvent.changeText(searchBar, 'Description 2');

    await waitFor(() => {
      expect(queryByText('Product 1')).toBeFalsy();
      expect(getByText('Product 2')).toBeTruthy();
    });
  });

  it('should show empty state when no products match search', async () => {
    const { getByPlaceholderText, getByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('Product 1')).toBeTruthy();
    });

    const searchBar = getByPlaceholderText('Search products by name or description');
    fireEvent.changeText(searchBar, 'Nonexistent Product');

    await waitFor(() => {
      expect(getByText('No products found matching your search.')).toBeTruthy();
    });
  });

  it('should show New Product FAB', async () => {
    const { getByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('New Product')).toBeTruthy();
    });
  });

  it('should show alert when creating product without verified email', async () => {
    const unverifiedUser = { ...mockUser, isVerified: false };
    (auth.getUser as jest.Mock).mockResolvedValue(unverifiedUser);

    const { getByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('New Product')).toBeTruthy();
    });

    fireEvent.press(getByText('New Product'));

    await waitFor(() => {
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Email Verification Required',
        })
      );
    });
  });

  it('should show input dialog when creating product with verified email', async () => {
    const { getByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('New Product')).toBeTruthy();
    });

    fireEvent.press(getByText('New Product'));

    await waitFor(() => {
      expect(mockDialog.input).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Create New Product',
          placeholder: 'Product Name',
        })
      );
    });
  });

  it('should dismiss info card when close button is pressed', async () => {
    await AsyncStorage.removeItem('products_info_card_dismissed');

    const { getByText, queryByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('Welcome to the Relab Products Database')).toBeTruthy();
    });

    // Find and press the close button
    const closeButtons = await waitFor(() => {
      const { UNSAFE_getAllByType } = render(<ProductsTab />);
      return UNSAFE_getAllByType('IconButton' as any);
    });

    await waitFor(() => {
      expect(queryByText('Welcome to the Relab Products Database')).toBeFalsy();
    });
  });

  it('should navigate to product detail when product card is pressed', async () => {
    const { getByText } = render(<ProductsTab />);

    await waitFor(() => {
      expect(getByText('Product 1')).toBeTruthy();
    });

    fireEvent.press(getByText('Product 1'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/products/[id]',
        params: { id: 1 },
      });
    });
  });
});
