import { createContext, type RefObject, useContext } from 'react';
import type { View } from 'react-native';

export type DialogButton = {
  text: string;
  onPress?: (value?: string) => void;
  disabled?: boolean | ((value: string) => boolean);
  /** Visual role: destructive gets the filled destructive variant; Enter never triggers it. */
  style?: 'default' | 'cancel' | 'destructive';
};

/** Optional single action on a toast — the undo affordance for a reversible change. */
export type ToastAction = {
  label: string;
  onPress: () => void;
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
  /** Return-focus target for native screen readers on close; see AppDialog's `triggerRef`. */
  triggerRef?: RefObject<View | null>;
};

export type DialogContextType = {
  alert: (options: DialogOptions) => void;
  input: (options: DialogOptions) => void;
  toast: (message: string, action?: ToastAction) => void;
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
