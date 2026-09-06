import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DocsLink } from '@/components/base/DocsLink';
import { openExternalUrl } from '@/services/externalLinks';

const mockConfig = { DOCS_URL: 'https://docs.example.com/' };
jest.mock('@/config', () => ({
  get DOCS_URL() {
    return mockConfig.DOCS_URL;
  },
}));

jest.mock('@/services/externalLinks', () => ({
  openExternalUrl: jest.fn(),
}));

const mockOpen = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

beforeEach(() => {
  mockConfig.DOCS_URL = 'https://docs.example.com/';
  mockOpen.mockReset();
  mockOpen.mockResolvedValue(undefined as never);
});

describe('DocsLink', () => {
  it('resolves the path against the configured docs origin', () => {
    render(
      <DocsLink path="/user-guides/data-collection" accessibilityLabel="Read the guide">
        Read the guide
      </DocsLink>,
    );
    fireEvent.press(screen.getByRole('link'));

    expect(mockOpen).toHaveBeenCalledWith('https://docs.example.com/user-guides/data-collection');
  });

  it('announces itself as a link with its own label, not the visible text', () => {
    render(
      <DocsLink path="/x" accessibilityLabel="Open the data collection guide">
        Learn more
      </DocsLink>,
    );

    expect(screen.getByRole('link', { name: 'Open the data collection guide' })).toBeOnTheScreen();
    expect(screen.getByText('Learn more')).toBeOnTheScreen();
  });

  // Self-hosters can run without a docs site; a dead link is worse than no link.
  it('renders nothing when no docs URL is configured', () => {
    mockConfig.DOCS_URL = '';
    render(
      <DocsLink path="/x" accessibilityLabel="Read the guide">
        Read the guide
      </DocsLink>,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Read the guide')).toBeNull();
  });
});
