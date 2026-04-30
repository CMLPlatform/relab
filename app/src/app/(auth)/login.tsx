import {
  LoginBrandHero,
  LoginDivider,
  LoginFormSection,
  LoginLayout,
  LoginOAuthSection,
  LoginSecondaryAction,
} from '@/components/auth/LoginSections';
import { useLoginScreen } from '@/hooks/auth/useLoginScreen';

export default function Login() {
  const { ui, form, actions } = useLoginScreen();
  const handleSubmit = async () => form.submit();
  const handleGoogleLogin = async () => actions.loginWithGoogle();
  const handleGithubLogin = async () => actions.loginWithGithub();

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
        onSubmit={handleSubmit}
        onForgotPassword={actions.goToForgotPassword}
      />
      <LoginDivider />
      <LoginOAuthSection onGoogle={handleGoogleLogin} onGithub={handleGithubLogin} />
      <LoginSecondaryAction onCreateAccount={actions.goToCreateAccount} />
    </LoginLayout>
  );
}
