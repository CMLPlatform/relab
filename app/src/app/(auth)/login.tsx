import {
  LoginBrandHero,
  LoginCard,
  LoginDivider,
  LoginFormSection,
  LoginLayout,
  LoginOAuthSection,
  LoginSecondaryAction,
} from '@/components/auth/LoginSections';
import { PrivacyPolicy } from '@/components/auth/NewAccountSections';
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
        {/* OAuth here can create an account (first sign-in provisions one), so the
            same terms/privacy line the password signup shows has to be visible
            before the user presses it. */}
        <PrivacyPolicy />
        <LoginSecondaryAction onCreateAccount={actions.goToCreateAccount} />
      </LoginCard>
    </LoginLayout>
  );
}
