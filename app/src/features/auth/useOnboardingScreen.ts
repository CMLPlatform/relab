import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { updateUser } from '@/services/api/auth/authentication';
import { type OnboardingFormValues, onboardingSchema } from '@/services/api/validation/userSchema';
import { getErrorMessage } from '@/utils/errors';

/** Username-picking step after a first sign-in: save, refresh the session, land on products. */
export function useOnboardingScreen() {
  const router = useRouter();
  const dialog = useDialog();
  const { refetch } = useAuth();

  const {
    control,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onChange',
    defaultValues: { username: '' },
  });

  const submitUsername = handleSubmit(async (data: OnboardingFormValues) => {
    try {
      await updateUser({ username: data.username });
      await refetch(false);
      router.replace({ pathname: '/products', params: { authenticated: 'true' } });
    } catch (error: unknown) {
      dialog.alert({
        title: "Couldn't save username",
        message: getErrorMessage(error, 'It might already be taken.'),
      });
    }
  });

  return { control, submitUsername, isValid, isSubmitting };
}
