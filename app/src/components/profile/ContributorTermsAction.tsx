import { useTermsAcceptance } from '@/features/auth/useTermsAcceptance';
import { ProfileAction } from './shared';

/**
 * Contributor-terms status and the way back to the prompt after dismissing it.
 * Reads the same dismissal store as the global dialog. Renders nothing once
 * acceptance is on record.
 */
export function ContributorTermsAction() {
  const { required, reopen } = useTermsAcceptance();
  if (!required) return null;
  return (
    <ProfileAction
      icon="info"
      title="Contributor terms"
      subtitle="Not accepted — your records stay out of published datasets"
      onPress={reopen}
    />
  );
}
