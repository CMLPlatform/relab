import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';
import { shareAsync } from 'expo-sharing';
import { HttpResponse, http } from 'msw';
import { ExportMenu } from '@/components/product/ExportMenu';
import { API_URL } from '@/config';
import { authRuntime } from '@/services/api/auth/authRuntime';
import { downloadExport, productExportUrl, productsExportUrl } from '@/services/api/products';
import {
  mockPlatform,
  renderWithProviders,
  restorePlatform,
  server,
  setupUser,
} from '@/test-utils/index';

const mockWrittenFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { cache: 'file:///cache' },
  File: class {
    uri: string;
    constructor(directory: string, name: string) {
      this.uri = `${directory}/${name}`;
    }
    write(content: string) {
      mockWrittenFiles.set(this.uri, content);
    }
  },
}));
jest.mock('expo-sharing', () => ({
  __esModule: true,
  shareAsync: require('@jest/globals').jest.fn(),
}));

const shareMock = shareAsync as jest.MockedFunction<typeof shareAsync>;
const CAP_MESSAGE = 'More than 100 products match. Narrow the filters to export them.';

beforeEach(() => {
  shareMock.mockReset();
  mockWrittenFiles.clear();
});

describe('ExportMenu', () => {
  const user = setupUser();

  it('saves the fetched export to a file and shares it on native', async () => {
    let requests = 0;
    server.use(
      http.get(`${API_URL}/products/:id/export`, () => {
        requests += 1;
        return new HttpResponse('id,parent_id\n7,\n', {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="relab-product-7-20260928.csv"',
          },
        });
      }),
    );
    await renderWithProviders(<ExportMenu label="Export" productId={7} />, { withDialog: true });

    await user.press(screen.getByText('Export'));
    await user.press(screen.getByText('CSV (spreadsheet)'));

    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    const uri = 'file:///cache/relab-product-7-20260928.csv';
    expect(mockWrittenFiles.get(uri)).toBe('id,parent_id\n7,\n');
    expect(shareMock).toHaveBeenCalledWith(uri, {
      mimeType: 'text/csv',
      dialogTitle: 'relab-product-7-20260928.csv',
    });
    expect(requests).toBe(1);
    expect(await screen.findByText('Export downloaded')).toBeOnTheScreen();
  });

  it("shows the server's reason when the export is refused", async () => {
    server.use(
      http.get(`${API_URL}/products/export`, () =>
        HttpResponse.json({ detail: CAP_MESSAGE }, { status: 400 }),
      ),
    );
    await renderWithProviders(<ExportMenu label="Export results" query={{ search: 'kettle' }} />, {
      withDialog: true,
    });

    await user.press(screen.getByText('Export results'));
    await user.press(screen.getByText('JSON'));

    expect(await screen.findByText(CAP_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByText('Export failed')).toBeOnTheScreen();
    expect(shareMock).not.toHaveBeenCalled();
  });
});

describe('productsExportUrl', () => {
  it('carries the list filters but no paging', () => {
    const url = productsExportUrl(
      { search: 'kettle', brands: ['acme'], orderBy: ['-created_at'], owner: 'me' },
      'json',
    );

    expect(url.href.startsWith(`${API_URL}/products/export?`)).toBe(true);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'json',
      search: 'kettle',
      'brand[in]': 'acme',
      order_by: '-created_at',
      owner: 'me',
    });
  });
});

describe('downloadExport on web', () => {
  it("saves the body under the server's filename", async () => {
    server.use(
      http.get(`${API_URL}/products/:id/export`, () =>
        HttpResponse.json([], {
          headers: {
            'Content-Disposition': 'attachment; filename="relab-product-7-20260928.json"',
          },
        }),
      ),
    );
    const link = { href: '', download: '', click: jest.fn() };
    const globals = globalThis as unknown as Record<string, unknown>;
    const originalDocument = globals.document;
    globals.document = { createElement: () => link };
    const createObjectURL = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    const revokeObjectURL = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    mockPlatform('web');
    try {
      await downloadExport(productExportUrl(7, 'json'));
      await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:export'));
    } finally {
      restorePlatform();
      globals.document = originalDocument;
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }

    expect(link.download).toBe('relab-product-7-20260928.json');
    expect(link.href).toBe('blob:export');
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(shareMock).not.toHaveBeenCalled();
  });
});

describe('downloadExport authentication', () => {
  afterEach(() => {
    authRuntime.token = undefined;
  });

  it.each([
    [{ owner: 'me' }, 'Bearer session-token'],
    [{ search: 'kettle' }, null],
  ] as const)('with %o sends Authorization %p', async (query, expected) => {
    authRuntime.token = 'session-token';
    let authorization: string | null | undefined;
    server.use(
      http.get(`${API_URL}/products/export`, ({ request }) => {
        authorization = request.headers.get('Authorization');
        return new HttpResponse('id\n', { headers: { 'Content-Type': 'text/csv' } });
      }),
    );

    await downloadExport(productsExportUrl(query, 'csv'));

    expect(authorization).toBe(expected);
  });
});
