import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';
import ProductFiles from '@/components/product/detail/ProductFiles';
import { mockUser } from '@/test-utils/api-mocks';
import { baseProduct, renderWithProviders } from '@/test-utils/index';
import type { ApiFileRead } from '@/types/api';
import type { User } from '@/types/User';

const mockUseAuth = jest.fn();
jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/services/api/files', () => ({
  ...(jest.requireActual('@/services/api/files') as object),
  fetchProductFiles: jest.fn(),
  uploadProductFile: jest.fn(),
  deleteProductFile: jest.fn(),
}));

const { fetchProductFiles } = jest.requireMock('@/services/api/files') as {
  fetchProductFiles: jest.Mock<() => Promise<ApiFileRead[]>>;
};

function signedInAs(role: User['role']) {
  mockUseAuth.mockReturnValue({ user: mockUser({ role }), isLoading: false });
}

const savedProduct = { ...baseProduct, id: 7, ownedBy: 'me' as const };

describe('ProductFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchProductFiles.mockResolvedValue([
      { id: 'f1', filename: 'cube.h5', description: 'Hyperspectral cube', file_url: '/uploads/x' },
    ]);
  });

  it('renders nothing at all for a contributor', async () => {
    signedInAs('contributor');

    renderWithProviders(<ProductFiles product={savedProduct} editMode />, { withDialog: true });

    expect(screen.queryByText('Research files')).toBeNull();
    // Asserts the payload, not only the heading. The emptiness guard below the
    // role check would hide the heading on its own, so a heading-only assertion
    // stays green even with the role gate deleted — it passed for the wrong
    // reason until this line was added.
    expect(screen.queryByText('cube.h5')).toBeNull();
    expect(screen.queryByText('Add research file')).toBeNull();
    // A contributor must not even request the list: the section is a lab
    // capability end to end, not a lab-only render of shared data.
    expect(fetchProductFiles).not.toHaveBeenCalled();
  });

  it('lists attached files for a lab account', async () => {
    signedInAs('lab');

    renderWithProviders(<ProductFiles product={savedProduct} editMode={false} />, {
      withDialog: true,
    });

    expect(await screen.findByText('cube.h5')).toBeTruthy();
    expect(screen.getByText('Research files')).toBeTruthy();
  });

  it('offers the picker to a lab owner in edit mode only', async () => {
    signedInAs('lab');

    const view = renderWithProviders(<ProductFiles product={savedProduct} editMode={false} />, {
      withDialog: true,
    });
    await screen.findByText('cube.h5');
    expect(screen.queryByText('Add research file')).toBeNull();

    view.rerender(<ProductFiles product={savedProduct} editMode />);
    expect(await screen.findByText('Add research file')).toBeTruthy();
  });

  it('withholds the picker from a lab account on a record it does not own', async () => {
    signedInAs('lab');

    renderWithProviders(
      <ProductFiles product={{ ...savedProduct, ownedBy: 'someone_else' }} editMode />,
      { withDialog: true },
    );

    await screen.findByText('cube.h5');
    expect(screen.queryByText('Add research file')).toBeNull();
  });

  it('does not offer the picker on an unsaved draft', async () => {
    signedInAs('lab');

    renderWithProviders(<ProductFiles product={{ ...baseProduct, id: undefined }} editMode />, {
      withDialog: true,
    });

    // No record id yet, so there is nothing to attach a file to.
    await waitFor(() => expect(fetchProductFiles).not.toHaveBeenCalled());
    expect(screen.queryByText('Add research file')).toBeNull();
  });
});
