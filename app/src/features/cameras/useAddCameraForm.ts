import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClaimPairingMutation } from '@/features/cameras/rpi/hooks';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ApiError } from '@/services/api/errors';
import { getErrorMessage } from '@/utils/errors';

const PAIRING_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const NON_ALPHANUMERIC_PAIRING_CODE_PATTERN = /[^A-Z0-9]/g;

/** Uppercase, strip non-alphanumerics, and cap the pairing code at 6 chars. */
export function sanitizePairingCode(value: string): string {
  return value.toUpperCase().replace(NON_ALPHANUMERIC_PAIRING_CODE_PATTERN, '').slice(0, 6);
}

const addCameraSchema = z.object({
  pairingCode: z.string().regex(PAIRING_CODE_PATTERN, 'Enter the 6-character pairing code'),
  name: z.string().trim().min(2, 'Camera name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
});

export type AddCameraFormValues = z.infer<typeof addCameraSchema>;

const CODE_NOT_FOUND_MESSAGE =
  'The pairing code was not found. Make sure the Raspberry Pi is powered on and showing a code, then try again in a few seconds.';

export function useAddCameraForm() {
  const router = useRouter();
  const feedback = useAppFeedback();
  const { user } = useRequireAuth('/cameras');
  const claimMutation = useClaimPairingMutation();
  const [pairingSuccess, setPairingSuccess] = useState(false);

  const { control, handleSubmit, reset } = useForm<AddCameraFormValues>({
    resolver: zodResolver(addCameraSchema),
    mode: 'onChange',
    defaultValues: { pairingCode: '', name: '', description: '' },
  });

  const submit = handleSubmit((values) => {
    claimMutation.mutate(
      {
        code: values.pairingCode,
        camera_name: values.name.trim(),
        description: values.description?.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          setPairingSuccess(true);
        },
        onError: (err) => {
          const isCodeMissing = err instanceof ApiError && err.status === 404;
          feedback.alert({
            title: 'Pairing failed',
            message: isCodeMissing ? CODE_NOT_FOUND_MESSAGE : getErrorMessage(err, String(err)),
            buttons: [{ text: 'OK' }],
          });
        },
      },
    );
  });

  const dismissSuccess = () => {
    setPairingSuccess(false);
    router.replace('/cameras');
  };

  return {
    user,
    control,
    submit,
    sanitizePairingCode,
    isPending: claimMutation.isPending,
    pairingSuccess,
    dismissSuccess,
  };
}
