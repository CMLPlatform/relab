import { useTermsAcceptance } from '@/features/auth/useTermsAcceptance';
import { ProfileAction } from './shared';

/**
 * Contributor-terms status, and the way back to the prompt after dismissing it.
 *
 * Self-contained rather than prop-threaded: it reads the same shared dismissal
 * store the globally-mounted dialog does, so reopening here actually reopens that
 * dialog. Renders nothing once acceptance is on record — a settled agreement is
 * not a setting.
 *
 * Lives beside ProfileAboutSection rather than inside it: this row depends on the
 * current account, and About is a section of static links that should stay
 * renderable without auth context.
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
