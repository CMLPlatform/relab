import Head from 'expo-router/head';
import { FramedAuthNotice } from '@/components/auth/FramedAuthNotice';
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
import { isFramed } from '@/utils/platformLayout';

export default function Login() {
  const { form, actions } = useLoginScreen();
  const handleSubmit = async () => form.submit();
  const handleGoogleLogin = async () => actions.loginWithGoogle();
  const handleGithubLogin = async () => actions.loginWithGithub();

  if (isFramed()) return <FramedAuthNotice />;

  return (
    <>
      <Head>
        <title>Sign in · Relab</title>
      </Head>
      <LoginLayout onBrowse={actions.browseProducts}>
        <LoginBrandHero />
        <LoginCard>
          <LoginFormSection
            control={form.control}
            emailRef={form.emailRef}
            passwordRef={form.passwordRef}
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
    </>
  );
}
