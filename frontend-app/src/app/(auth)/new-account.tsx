import {
  NewAccountEmailStep,
  NewAccountLayout,
  NewAccountPasswordStep,
  NewAccountUsernameStep,
} from '@/components/auth/NewAccountSections';
import { useNewAccountScreen } from '@/hooks/auth/useNewAccountScreen';

export default function NewAccount() {
  const { ui, flow, form, actions } = useNewAccountScreen();
  const handleAdvanceFromUsername = async () => actions.advanceFromUsername();
  const handleAdvanceFromEmail = async () => actions.advanceFromEmail();
  const handleCreateAccount = async () => actions.createAccount();

  return (
    <NewAccountLayout overlayColor={ui.overlayColor} onNavigateToLogin={actions.goToLogin}>
      {flow.section === 'username' ? (
        <NewAccountUsernameStep
          control={form.control}
          errors={form.errors}
          headlineColor={ui.headlineColor}
          mutedColor={ui.mutedColor}
          onAdvance={handleAdvanceFromUsername}
        />
      ) : null}

      {flow.section === 'email' ? (
        <NewAccountEmailStep
          control={form.control}
          errors={form.errors}
          headlineColor={ui.headlineColor}
          mutedColor={ui.mutedColor}
          username={flow.username}
          onAdvance={handleAdvanceFromEmail}
          onBack={actions.goBackToUsername}
        />
      ) : null}

      {flow.section === 'password' ? (
        <NewAccountPasswordStep
          control={form.control}
          errors={form.errors}
          headlineColor={ui.headlineColor}
          mutedColor={ui.mutedColor}
          username={flow.username}
          isSubmitting={form.isSubmitting}
          onSubmit={handleCreateAccount}
          onBack={actions.goBackToEmail}
        />
      ) : null}
    </NewAccountLayout>
  );
}
