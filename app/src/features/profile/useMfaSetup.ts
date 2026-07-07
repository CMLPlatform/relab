import { useCallback, useRef, useState } from 'react';
import {
  confirmTotpSetup,
  disableTotp,
  regenerateRecoveryCodes,
  startTotpSetup,
  type TotpSetup,
} from '@/services/api/auth/authMfa';
import { getErrorMessage } from '@/utils/errors';

type Mode = 'idle' | 'enroll' | 'disable' | 'regenerate' | 'codes';

type MfaSetupController = {
  mode: Mode;
  setup: TotpSetup | null;
  code: string;
  password: string;
  recoveryCodes: string[] | null;
  error: string | null;
  busy: boolean;
  starting: boolean;
  canSubmit: boolean;
  setCode: (value: string) => void;
  setPassword: (value: string) => void;
  start: () => Promise<void>;
  confirm: (submitCode?: string) => Promise<void>;
  beginDisable: (reenrollAfter: boolean) => void;
  disable: (submitCode?: string) => Promise<void>;
  beginRegenerate: () => void;
  regenerate: (submitCode?: string) => Promise<void>;
  cancel: () => void;
};

/**
 * Drives every account-side TOTP flow over the auth API: enroll (setup → confirm,
 * which returns one-time recovery codes), turn-off (confirm a current code), and
 * regenerate recovery codes (confirm a current code). "Reset" chains a turn-off
 * into a fresh enrollment. `onChange` refetches the user so the account screen
 * reflects the new state. `submitCode` lets auto-submit pass the fresh value
 * without waiting for a state round-trip.
 */
export function useMfaSetup(onChange: () => unknown): MfaSetupController {
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reenrollAfter = useRef(false);

  const reset = useCallback(() => {
    setMode('idle');
    setSetup(null);
    setCode('');
    setPassword('');
    setRecoveryCodes(null);
    setError(null);
    setBusy(false);
  }, []);

  const beginEnroll = useCallback(async () => {
    setSetup(await startTotpSetup());
    setCode('');
    setPassword('');
    setError(null);
    setMode('enroll');
  }, []);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await beginEnroll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to start setup. Please try again.'));
    } finally {
      setBusy(false);
    }
  }, [beginEnroll, busy]);

  const confirm = useCallback(
    async (submitCode: string = code) => {
      if (!setup || submitCode.length !== 6 || !password || busy) return;
      setBusy(true);
      setError(null);
      try {
        const codes = await confirmTotpSetup(setup.setupToken, submitCode, password);
        await onChange();
        setRecoveryCodes(codes);
        setCode('');
        setPassword('');
        setMode('codes');
        setBusy(false);
      } catch (err) {
        setError(getErrorMessage(err, "That code didn't match. Try the current one."));
        setBusy(false);
      }
    },
    [busy, code, onChange, password, setup],
  );

  // Disable and regenerate share one shape: confirm a current 6-digit code, then
  // run an action. The action owns its own success transition; the catch here
  // owns the shared error + unbusy path.
  const withCurrentCode = useCallback(
    async (submitCode: string, action: (currentCode: string) => Promise<void>) => {
      if (submitCode.length !== 6 || busy) return;
      setBusy(true);
      setError(null);
      try {
        await action(submitCode);
      } catch (err) {
        setError(getErrorMessage(err, "That code didn't match. Try the current one."));
        setBusy(false);
      }
    },
    [busy],
  );

  const beginDisable = useCallback((reenroll: boolean) => {
    reenrollAfter.current = reenroll;
    setCode('');
    setError(null);
    setMode('disable');
  }, []);

  const disable = useCallback(
    (submitCode: string = code) =>
      withCurrentCode(submitCode, async (currentCode) => {
        await disableTotp(currentCode);
        await onChange();
        if (reenrollAfter.current) {
          await beginEnroll();
          setBusy(false);
        } else {
          reset();
        }
      }),
    [beginEnroll, code, onChange, reset, withCurrentCode],
  );

  const beginRegenerate = useCallback(() => {
    setCode('');
    setError(null);
    setMode('regenerate');
  }, []);

  const regenerate = useCallback(
    (submitCode: string = code) =>
      withCurrentCode(submitCode, async (currentCode) => {
        const codes = await regenerateRecoveryCodes(currentCode);
        setRecoveryCodes(codes);
        setCode('');
        setMode('codes');
        setBusy(false);
      }),
    [code, withCurrentCode],
  );

  // Enroll needs a password (reauth); the code flows need only the 6-digit code.
  const canSubmit = code.length === 6 && !busy && (mode === 'enroll' ? password.length > 0 : true);

  return {
    mode,
    setup,
    code,
    password,
    recoveryCodes,
    error,
    busy,
    starting: busy && mode === 'idle',
    canSubmit,
    setCode: useCallback((value: string) => setCode(value.replace(/\D/g, '').slice(0, 6)), []),
    setPassword,
    start,
    confirm,
    beginDisable,
    disable,
    beginRegenerate,
    regenerate,
    cancel: reset,
  };
}
