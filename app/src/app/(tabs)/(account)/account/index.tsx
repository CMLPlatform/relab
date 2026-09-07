import { maybeCompleteAuthSession } from 'expo-web-browser';
import { AccountScreen } from '@/components/profile/AccountScreen';

maybeCompleteAuthSession({ skipRedirectCheck: true });

export default function ProfileTab() {
  return <AccountScreen />;
}
