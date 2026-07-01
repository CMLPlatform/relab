import { createContext, useContext } from 'react';

export type DialogButton = {
  text: string;
  onPress?: (value?: string) => void;
  disabled?: boolean | ((value: string) => boolean);
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

export const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function useOptionalDialog() {
  return useContext(DialogContext);
}
