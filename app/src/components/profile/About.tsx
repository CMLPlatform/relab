import { useCallback } from 'react';
import { View } from 'react-native';
import { DOCS_URL } from '@/config';
import { openExternalUrl } from '@/services/externalLinks';
import { ProfileAction } from './shared';

const NINE_R_FRAMEWORK_DOCS_PATH = '/project/9r-framework';
const GLOSSARY_DOCS_PATH = '/user-guides/glossary';

/** Background/links section: the 9R framework the mark's nine nods to, and the glossary. */
export function ProfileAboutSection() {
  const openNineRFramework = useCallback(() => {
    if (DOCS_URL) {
      void openExternalUrl(new URL(NINE_R_FRAMEWORK_DOCS_PATH, DOCS_URL).toString());
    }
  }, []);
  const openGlossary = useCallback(() => {
    if (DOCS_URL) {
      void openExternalUrl(new URL(GLOSSARY_DOCS_PATH, DOCS_URL).toString());
    }
  }, []);

  return (
    <View className="mx-1">
      <ProfileAction
        icon="tag"
        title="Glossary"
        subtitle="What the words in Relab mean, in plain language"
        onPress={openGlossary}
      />
      <ProfileAction
        icon="info"
        title="The 9R framework"
        subtitle="The nine circular-economy strategies behind Relab"
        onPress={openNineRFramework}
      />
    </View>
  );
}
