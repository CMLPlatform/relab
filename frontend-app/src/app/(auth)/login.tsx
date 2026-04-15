import {
  LoginBrandHero,
  LoginDivider,
  LoginFormSection,
  LoginLayout,
  LoginOAuthSection,
  LoginSecondaryAction,
} from '@/components/auth/LoginSections';
import { useLoginScreen } from '@/hooks/useLoginScreen';

export default function Login() {
  const { ui, form, actions } = useLoginScreen();

  return (
    <LoginLayout
      colorScheme={ui.colorScheme}
      keyboardShown={ui.keyboardShown}
      onBrowse={actions.browseProducts}
    >
      <LoginBrandHero colorScheme={ui.colorScheme} />
      <LoginFormSection
        control={form.control}
        emailRef={form.emailRef}
        onSubmit={() => {
          void form.submit();
        }}
        onForgotPassword={actions.goToForgotPassword}
      />
      <LoginDivider />
      <LoginOAuthSection
        onGoogle={() => {
          void actions.loginWithGoogle();
        }}
        onGithub={() => {
          void actions.loginWithGithub();
        }}
      />
      <LoginSecondaryAction onCreateAccount={actions.goToCreateAccount} />
    </LoginLayout>
  );
}
