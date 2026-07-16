import {
  LoginBrandHero,
  LoginCard,
  LoginDivider,
  LoginFormSection,
  LoginLayout,
  LoginOAuthSection,
  LoginSecondaryAction,
} from '@/components/auth/LoginSections';
import { useLoginScreen } from '@/features/auth/useLoginScreen';

export default function Login() {
  const { form, actions } = useLoginScreen();
  const handleSubmit = async () => form.submit();
  const handleGoogleLogin = async () => actions.loginWithGoogle();
  const handleGithubLogin = async () => actions.loginWithGithub();

  return (
    <LoginLayout onBrowse={actions.browseProducts}>
      <LoginBrandHero />
      <LoginCard>
        <LoginFormSection
          control={form.control}
          emailRef={form.emailRef}
          onSubmit={handleSubmit}
          onForgotPassword={actions.goToForgotPassword}
        />
        <LoginDivider />
        <LoginOAuthSection onGoogle={handleGoogleLogin} onGithub={handleGithubLogin} />
        <LoginSecondaryAction onCreateAccount={actions.goToCreateAccount} />
      </LoginCard>
    </LoginLayout>
  );
}
