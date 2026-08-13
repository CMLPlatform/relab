import { useCallback } from 'react';
import { View } from 'react-native';
import { DOCS_URL } from '@/config';
import { openExternalUrl } from '@/services/externalLinks';
import { ProfileAction } from './shared';

const NINE_R_FRAMEWORK_DOCS_PATH = '/project/9r-framework';

/** Background/links section: currently just the 9R framework the mark's nine nods to. */
export function ProfileAboutSection() {
  const openNineRFramework = useCallback(() => {
    if (DOCS_URL) {
      void openExternalUrl(new URL(NINE_R_FRAMEWORK_DOCS_PATH, DOCS_URL).toString());
    }
  }, []);

  return (
    <View className="mx-1">
      <ProfileAction
        icon="info"
        title="The 9R framework"
        subtitle="The circular-economy model behind the nine in the mark"
        onPress={openNineRFramework}
      />
    </View>
  );
}
