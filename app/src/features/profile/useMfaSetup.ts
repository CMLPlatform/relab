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

export type MfaSetupController = {
  mode: Mode;
  setup: TotpSetup | null;
  code: string;
  password: string;
  recoveryInput: string;
  useRecoveryCode: boolean;
  recoveryCodes: string[] | null;
  error: string | null;
  busy: boolean;
  starting: boolean;
  canSubmit: boolean;
  setCode: (value: string) => void;
  setPassword: (value: string) => void;
  setRecoveryInput: (value: string) => void;
  toggleRecoveryInput: () => void;
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
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: one controller owns all account-side TOTP flows (enroll/disable/regenerate); the useCallback wiring reads clearer here than split across hooks that would only pass the same shared state around.
export function useMfaSetup(onChange: () => unknown): MfaSetupController {
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  // A recovery code the user types to turn MFA off when they've lost their authenticator.
  const [recoveryInput, setRecoveryInput] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reenrollAfter = useRef(false);
  // `busy` is state, so two submits in the same tick both read the stale `false`
  // from their closure. A ref is the only guard that actually single-flights a
  // double tap — and a TOTP code is single-use, so a second submit burns it.
  const inFlight = useRef(false);

  const beginRequest = useCallback(() => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    return true;
  }, []);

  const endRequest = useCallback(() => {
    inFlight.current = false;
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    inFlight.current = false;
    setMode('idle');
    setSetup(null);
    setCode('');
    setPassword('');
    setRecoveryInput('');
    setUseRecoveryCode(false);
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
    if (!beginRequest()) return;
    try {
      await beginEnroll();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to start setup. Please try again.'));
    } finally {
      endRequest();
    }
  }, [beginEnroll, beginRequest, endRequest]);

  const confirm = useCallback(
    async (submitCode: string = code) => {
      if (!setup || submitCode.length !== 6 || !password) return;
      if (!beginRequest()) return;
      try {
        const codes = await confirmTotpSetup(setup.setupToken, submitCode, password);
        // MFA is now enabled server-side and these codes are shown only once — surface
        // them before refetching so a failed refetch can't discard the sole copy.
        setRecoveryCodes(codes);
        setCode('');
        setPassword('');
        // The shared secret and setup token are spent; don't hold them through the
        // recovery-codes screen.
        setSetup(null);
        setMode('codes');
        endRequest();
      } catch (err) {
        setError(getErrorMessage(err, "That code didn't match. Try the current one."));
        endRequest();
        return;
      }
      // Best-effort refresh; the codes are already shown, so its failure is non-fatal.
      try {
        await onChange();
      } catch {
        // The account screen will catch up on its next natural refetch.
      }
    },
    [beginRequest, code, endRequest, onChange, password, setup],
  );

  // Disable and regenerate share one shape: confirm a current 6-digit code, then
  // run an action. The action owns its own success transition; the catch here
  // owns the shared error + unbusy path.
  const withCurrentCode = useCallback(
    async (submitCode: string, action: (currentCode: string) => Promise<void>) => {
      if (submitCode.length < 6) return;
      if (!beginRequest()) return;
      try {
        await action(submitCode);
      } catch (err) {
        setError(getErrorMessage(err, "That code didn't match. Try the current one."));
        endRequest();
      }
    },
    [beginRequest, endRequest],
  );

  const beginDisable = useCallback((reenroll: boolean) => {
    reenrollAfter.current = reenroll;
    setCode('');
    setRecoveryInput('');
    setUseRecoveryCode(false);
    setError(null);
    setMode('disable');
  }, []);

  const toggleRecoveryInput = useCallback(() => {
    setUseRecoveryCode((prev) => !prev);
    setError(null);
  }, []);

  const disable = useCallback(
    (submitCode: string = useRecoveryCode ? recoveryInput.trim() : code) =>
      withCurrentCode(submitCode, async (currentCode) => {
        // Only disableTotp can fail because of a bad code. Once it succeeds MFA is
        // off server-side, so a later failure must not be reported as "wrong code"
        // — that would strand the dialog contradicting the server.
        await disableTotp(currentCode);
        try {
          await onChange();
          if (reenrollAfter.current) {
            await beginEnroll();
            endRequest();
            return;
          }
        } catch {
          // The account screen catches up on its next natural refetch; a failed
          // re-enroll simply drops the user back to the idle state.
        }
        reset();
      }),
    [
      beginEnroll,
      code,
      endRequest,
      onChange,
      recoveryInput,
      reset,
      useRecoveryCode,
      withCurrentCode,
    ],
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
        endRequest();
      }),
    [code, endRequest, withCurrentCode],
  );

  // Enroll needs a password (reauth); disable may use a recovery code instead of the
  // 6-digit code; the other code flows need only the 6-digit code.
  const submitReady =
    mode === 'disable' && useRecoveryCode ? recoveryInput.trim().length >= 6 : code.length === 6;
  const canSubmit = submitReady && !busy && (mode === 'enroll' ? password.length > 0 : true);

  return {
    mode,
    setup,
    code,
    password,
    recoveryInput,
    useRecoveryCode,
    recoveryCodes,
    error,
    busy,
    starting: busy && mode === 'idle',
    canSubmit,
    setCode: useCallback((value: string) => setCode(value.replace(/\D/g, '').slice(0, 6)), []),
    setPassword,
    setRecoveryInput,
    toggleRecoveryInput,
    start,
    confirm,
    beginDisable,
    disable,
    beginRegenerate,
    regenerate,
    cancel: reset,
  };
}
