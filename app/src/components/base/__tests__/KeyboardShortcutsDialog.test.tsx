import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { KeyboardShortcutsDialog } from '@/components/base/KeyboardShortcutsDialog';
import { setShortcutsEnabled } from '@/hooks/useShortcutsEnabled';

describe('KeyboardShortcutsDialog', () => {
  const originalPlatform = Platform.OS;
  let listener: ((event: KeyboardEvent) => void) | undefined;
  const addEventListener = jest.fn((_: string, handler: (event: KeyboardEvent) => void) => {
    listener = handler;
  });
  const querySelector = jest.fn<(selectors: string) => Element | null>(() => null);

  function pressQuestionMark(target: unknown = { tagName: 'DIV' }) {
    return act(() => {
      listener?.({ key: '?', target, preventDefault: jest.fn() } as unknown as KeyboardEvent);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    listener = undefined;
    querySelector.mockReturnValue(null);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener, removeEventListener: jest.fn() },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector },
    });
    setShortcutsEnabled(true);
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('stays closed until "?" is pressed', async () => {
    await render(<KeyboardShortcutsDialog />);
    expect(screen.queryByText('Keyboard shortcuts')).not.toBeOnTheScreen();

    await pressQuestionMark();

    expect(screen.getByText('Keyboard shortcuts')).toBeOnTheScreen();
  });

  it('groups each shortcut under the screen it works on', async () => {
    await render(<KeyboardShortcutsDialog />);
    await pressQuestionMark();

    // The grouping is the point: every binding but "?" is focus-scoped.
    expect(screen.getByText('Products list')).toBeOnTheScreen();
    expect(screen.getByText('New product')).toBeOnTheScreen();
    expect(screen.getByText('Product page')).toBeOnTheScreen();
    expect(screen.getByText('Leave edit mode')).toBeOnTheScreen();
  });

  it('ignores "?" typed into a field', async () => {
    await render(<KeyboardShortcutsDialog />);

    await pressQuestionMark({ tagName: 'INPUT' });

    expect(screen.queryByText('Keyboard shortcuts')).not.toBeOnTheScreen();
  });

  it('offers the WCAG 2.1.4 off switch', async () => {
    await render(<KeyboardShortcutsDialog />);
    await pressQuestionMark();

    expect(screen.getByLabelText('Single-key shortcuts')).toBeOnTheScreen();
  });

  it('still opens on "?" once single-key shortcuts are off', async () => {
    setShortcutsEnabled(false);
    await render(<KeyboardShortcutsDialog />);

    await pressQuestionMark();

    // "?" is the only route back to the switch, so it stays bound on purpose.
    expect(screen.getByLabelText('Single-key shortcuts')).toBeOnTheScreen();
  });

  it('renders nothing on native', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });

    await render(<KeyboardShortcutsDialog />);

    expect(addEventListener).not.toHaveBeenCalled();
    expect(screen.queryByText('Keyboard shortcuts')).not.toBeOnTheScreen();
  });
});
