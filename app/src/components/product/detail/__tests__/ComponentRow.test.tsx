import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { ComponentRow } from '@/components/product/detail/ComponentRow';
import { getComponent } from '@/services/api/products';
import { baseProduct, renderWithProviders } from '@/test-utils/index';
import type { Product } from '@/types/Product';

jest.mock('@/services/api/products', () => {
  const actual =
    jest.requireActual<typeof import('@/services/api/products')>('@/services/api/products');
  return { ...actual, getComponent: jest.fn() };
});

const mockGetComponent = jest.mocked(getComponent);
const mockPush = jest.fn();

function makeComponent(overrides: Partial<Product> = {}): Product {
  return {
    ...baseProduct,
    id: 10,
    role: 'component',
    parentID: 1,
    name: 'Motor Assembly',
    productTypeName: 'Motor',
    components: [],
    ...overrides,
  };
}

const loadedChild = makeComponent({ id: 11, name: 'Rotor', productTypeName: undefined });

describe('ComponentRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    });
  });

  it('renders name and type', () => {
    renderWithProviders(<ComponentRow component={makeComponent()} enabled={true} />);
    expect(screen.getByText('Motor Assembly')).toBeOnTheScreen();
    expect(screen.getByText('Motor')).toBeOnTheScreen();
  });

  it('navigates to the component detail route on press', () => {
    renderWithProviders(<ComponentRow component={makeComponent()} enabled={true} />);
    fireEvent.press(screen.getByText('Motor Assembly'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/components/[id]',
      params: { id: '10' },
    });
  });

  it('does not navigate when disabled via enabled={false}', () => {
    renderWithProviders(<ComponentRow component={makeComponent()} enabled={false} />);
    fireEvent.press(screen.getByText('Motor Assembly'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows neither badge nor chevron when children are loaded and empty', () => {
    renderWithProviders(
      <ComponentRow component={makeComponent({ components: [] })} enabled={true} />,
    );
    expect(screen.queryByLabelText('Show components of Motor Assembly')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('expands and collapses already-loaded children without fetching', () => {
    renderWithProviders(
      <ComponentRow component={makeComponent({ components: [loadedChild] })} enabled={true} />,
    );

    expect(screen.getByText('1')).toBeOnTheScreen(); // child-count badge

    fireEvent.press(screen.getByLabelText('Show components of Motor Assembly'));
    expect(screen.getByText('Rotor')).toBeOnTheScreen();
    expect(mockGetComponent).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Hide components of Motor Assembly'));
    expect(screen.queryByText('Rotor')).toBeNull();
  });

  it('lazily fetches children on expand when not loaded', async () => {
    mockGetComponent.mockResolvedValue(makeComponent({ components: [loadedChild] }));
    renderWithProviders(
      <ComponentRow component={makeComponent({ components: undefined })} enabled={true} />,
    );

    fireEvent.press(screen.getByLabelText('Show components of Motor Assembly'));
    expect(screen.getByText('Loading components…')).toBeOnTheScreen();

    await waitFor(() => {
      expect(screen.getByText('Rotor')).toBeOnTheScreen();
    });
    expect(mockGetComponent).toHaveBeenCalledWith(10);
  });

  it('keeps the row expanded with a "No subcomponents" line when a fetch resolves empty', async () => {
    mockGetComponent.mockResolvedValue(makeComponent({ components: [] }));
    renderWithProviders(
      <ComponentRow component={makeComponent({ components: undefined })} enabled={true} />,
    );

    fireEvent.press(screen.getByLabelText('Show components of Motor Assembly'));
    expect(screen.getByText('Loading components…')).toBeOnTheScreen();

    await waitFor(() => {
      expect(screen.getByText('No subcomponents')).toBeOnTheScreen();
    });
    // The chevron stays put (as "Hide…") instead of vanishing mid-interaction.
    expect(screen.getByLabelText('Hide components of Motor Assembly')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Hide components of Motor Assembly'));
    expect(screen.queryByText('No subcomponents')).toBeNull();
  });

  it('falls back to "Unnamed component" for the a11y label when the name is blank', () => {
    renderWithProviders(
      <ComponentRow
        component={makeComponent({ name: '', components: [loadedChild] })}
        enabled={true}
      />,
    );
    expect(screen.getByText('Unnamed component')).toBeOnTheScreen();
    expect(screen.getByLabelText('Show components of Unnamed component')).toBeOnTheScreen();
  });

  it('shows a retryable error row when the fetch fails', async () => {
    // componentQueryOptions retries once internally, so fail both attempts.
    mockGetComponent
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(makeComponent({ components: [loadedChild] }));
    renderWithProviders(
      <ComponentRow component={makeComponent({ components: undefined })} enabled={true} />,
    );

    fireEvent.press(screen.getByLabelText('Show components of Motor Assembly'));
    await waitFor(
      () => {
        expect(screen.getByText("Couldn't load components — tap to retry")).toBeOnTheScreen();
      },
      { timeout: 5000 },
    );

    fireEvent.press(screen.getByText("Couldn't load components — tap to retry"));
    await waitFor(() => {
      expect(screen.getByText('Rotor')).toBeOnTheScreen();
    });
  });

  it('does not offer expansion on nested child rows (one level deep only)', () => {
    const grandchild = makeComponent({ id: 12, name: 'Magnet' });
    const child = makeComponent({ id: 11, name: 'Rotor', components: [grandchild] });
    renderWithProviders(
      <ComponentRow component={makeComponent({ components: [child] })} enabled={true} />,
    );

    fireEvent.press(screen.getByLabelText('Show components of Motor Assembly'));
    expect(screen.getByText('Rotor')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Show components of Rotor')).toBeNull();
    expect(screen.queryByText('Magnet')).toBeNull();
  });
});
