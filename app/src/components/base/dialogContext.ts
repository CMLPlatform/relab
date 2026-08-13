import { createContext, useContext } from 'react';

export type DialogButton = {
  text: string;
  onPress?: (value?: string) => void;
  disabled?: boolean | ((value: string) => boolean);
  /** Visual role: destructive gets the filled destructive variant; Enter never triggers it. */
  style?: 'default' | 'cancel' | 'destructive';
};

export type DialogOptions = {
  title?: string;
  message?: string;
  buttons?: DialogButton[];
  input?: boolean;
  defaultValue?: string;
  placeholder?: string;
  helperText?: string;
  error?: boolean;
};

export type DialogContextType = {
  alert: (options: DialogOptions) => void;
  input: (options: DialogOptions) => void;
  toast: (message: string) => void;
};

/**
 * The button Enter/return submits: the last button that is neither destructive nor
 * cancel. A dialog whose only actions are destructive/cancel has no safe default, so
 * this returns undefined rather than falling back to firing one of them.
 */
export function pickSubmitButton(buttons: DialogButton[]): DialogButton | undefined {
  return [...buttons].reverse().find((b) => b.style !== 'destructive' && b.style !== 'cancel');
}

export const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function useOptionalDialog() {
  return useContext(DialogContext);
}
