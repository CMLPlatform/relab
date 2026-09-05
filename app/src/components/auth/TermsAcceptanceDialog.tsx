import { useCallback } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { WEBSITE_URL } from '@/config';
import { useTermsAcceptance } from '@/features/auth/useTermsAcceptance';
import { openExternalUrl } from '@/services/externalLinks';

/**
 * Asks accounts created before acceptance was tracked to grant the publication
 * licence a dataset release needs.
 *
 * Declining is free and changes nothing: the account keeps full access, and its
 * records simply stay out of published releases. That is deliberate — a grant
 * extracted by withholding access is the one whose validity gets questioned.
 */
export function TermsAcceptanceDialog() {
  const { shouldPrompt, isAccepting, accept, dismiss } = useTermsAcceptance();
  const termsUrl = WEBSITE_URL ? new URL('/terms', WEBSITE_URL).toString() : '';

  const openTerms = useCallback(() => {
    if (termsUrl) void openExternalUrl(termsUrl);
  }, [termsUrl]);

  const onAccept = useCallback(() => {
    void accept();
  }, [accept]);

  return (
    <AppDialog visible={shouldPrompt} onDismiss={dismiss}>
      <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
        Contributor terms
      </AppText>
      <View className="gap-3">
        <AppText variant="body">
          Relab publishes curated datasets of the records contributed to it. Your records can only
          be included if you accept the contributor terms.
        </AppText>
        <AppText variant="body" className="text-muted-foreground">
          Nothing changes if you decline — you keep full access to Relab, and your records stay out
          of published datasets. You can accept later from your account screen.
        </AppText>
      </View>
      <View style={dialogActionsStyle}>
        {termsUrl ? (
          <AppButton variant="ghost" onPress={openTerms}>
            <AppText variant="body">Read terms</AppText>
          </AppButton>
        ) : null}
        <AppButton variant="ghost" onPress={dismiss}>
          <AppText variant="body">Not now</AppText>
        </AppButton>
        <AppButton onPress={onAccept} disabled={isAccepting}>
          <AppText variant="body">{isAccepting ? 'Saving…' : 'Accept'}</AppText>
        </AppButton>
      </View>
    </AppDialog>
  );
}
