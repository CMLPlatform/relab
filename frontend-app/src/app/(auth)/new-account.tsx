import {
  NewAccountEmailStep,
  NewAccountLayout,
  NewAccountPasswordStep,
  NewAccountUsernameStep,
} from '@/components/auth/NewAccountSections';
import { useNewAccountScreen } from '@/hooks/useNewAccountScreen';

export default function NewAccount() {
  const { ui, flow, form, actions } = useNewAccountScreen();

  return (
    <NewAccountLayout
      overlayColor={ui.overlayColor}
      colorScheme={ui.colorScheme}
      onNavigateToLogin={actions.goToLogin}
    >
      {flow.section === 'username' ? (
        <NewAccountUsernameStep
          control={form.control}
          errors={form.errors}
          headlineColor={ui.headlineColor}
          mutedColor={ui.mutedColor}
          onAdvance={() => {
            void actions.advanceFromUsername();
          }}
        />
      ) : null}

      {flow.section === 'email' ? (
        <NewAccountEmailStep
          control={form.control}
          errors={form.errors}
          headlineColor={ui.headlineColor}
          mutedColor={ui.mutedColor}
          username={flow.username}
          onAdvance={() => {
            void actions.advanceFromEmail();
          }}
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
          onSubmit={() => {
            void actions.createAccount();
          }}
          onBack={actions.goBackToEmail}
        />
      ) : null}
    </NewAccountLayout>
  );
}
