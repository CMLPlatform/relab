import type { Router } from 'expo-router';
import type { DialogContextType } from '@/components/common/DialogProvider';
import { setNewProductIntent } from '@/services/newProductStore';

type CurrentUser = {
  isVerified: boolean;
};

type UseNewProductActionParams = {
  dialog: DialogContextType;
  router: Router;
  currentUser?: CurrentUser | null;
};

export function useNewProductAction({ dialog, router, currentUser }: UseNewProductActionParams) {
  return () => {
    if (!currentUser) {
      dialog.alert({
        title: 'Sign In Required',
        message: 'Sign in to add new products and manage your own submissions.',
        buttons: [
          { text: 'Cancel' },
          { text: 'Sign in', onPress: () => router.push('/login?redirectTo=/products') },
        ],
      });
      return;
    }

    if (!currentUser.isVerified) {
      dialog.alert({
        title: 'Email Verification Required',
        message:
          'Please verify your email address before creating products. Check your inbox for the verification link or go to your Profile to resend it.',
        buttons: [
          { text: 'OK' },
          { text: 'Go to Profile', onPress: () => router.push('/profile') },
        ],
      });
      return;
    }

    dialog.input({
      title: 'Create New Product',
      placeholder: 'Product Name',
      helperText: 'Enter a descriptive name between 2 and 100 characters',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'OK',
          disabled: (value) => {
            const name = typeof value === 'string' ? value.trim() : '';
            return name.length < 2 || name.length > 100;
          },
          onPress: (productName) => {
            const name = typeof productName === 'string' ? productName.trim() : '';
            setNewProductIntent({ name });
            router.push({ pathname: '/products/[id]', params: { id: 'new' } });
          },
        },
      ],
    });
  };
}
