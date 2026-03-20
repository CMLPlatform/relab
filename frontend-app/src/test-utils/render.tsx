import React from 'react';
import { render } from '@testing-library/react-native';
import type { RenderOptions } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { DialogProvider } from '@/components/common/DialogProvider';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  withDialog?: boolean;
}

/**
 * Custom render that wraps the UI in the app's standard provider stack.
 *
 * By default includes PaperProvider only. Pass `withDialog: true` for screens
 * that use the DialogProvider (e.g. screens with confirmation dialogs).
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { withDialog = false, ...options }: RenderWithProvidersOptions = {},
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    if (withDialog) {
      return (
        <PaperProvider>
          <DialogProvider>{children}</DialogProvider>
        </PaperProvider>
      );
    }
    return <PaperProvider>{children}</PaperProvider>;
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
