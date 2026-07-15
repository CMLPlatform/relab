import { Radio, Webcam } from 'lucide-react-native';
import { useCallback } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/ui/icon';
import { Switch } from '@/components/base/ui/switch';
import { DOCS_URL } from '@/config';
import { openExternalUrl } from '@/services/externalLinks';
import { useAppTheme } from '@/theme';
import { ProfileAction } from './shared';
import { createProfileSectionStyles } from './styles';

type ProfileIntegrationsSectionProps = {
  rpiEnabled: boolean;
  rpiLoading: boolean;
  onSetRpiEnabled: (enabled: boolean) => void;
  onManageCameras: () => void;
  youtubeEnabled: boolean;
  youtubeLoading: boolean;
  youtubeAuthPending: boolean;
  onToggleYouTube: (enabled: boolean) => void;
};

export function ProfileIntegrationsSection({
  rpiEnabled,
  rpiLoading,
  onSetRpiEnabled,
  onManageCameras,
  youtubeEnabled,
  youtubeLoading,
  youtubeAuthPending,
  onToggleYouTube,
}: ProfileIntegrationsSectionProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  const openDocs = useCallback(() => {
    if (DOCS_URL) {
      void openExternalUrl(new URL('/user-guides/rpi-cam', DOCS_URL).toString());
    }
  }, []);
  return (
    <View style={styles.section}>
      <View style={styles.integrationRow}>
        <View style={styles.integrationIcon}>
          <Icon as={Webcam} size={22} color={theme.colors.onSurfaceVariant} />
        </View>
        <View style={styles.integrationCopy}>
          <AppText style={styles.actionTitle}>RPi Camera</AppText>
          <AppText style={styles.actionSubtitle}>
            Capture images with a Raspberry Pi camera during disassembly.{' '}
            <AppText style={styles.docsLink} onPress={openDocs}>
              Learn more
            </AppText>
          </AppText>
        </View>
        <Switch
          checked={rpiEnabled}
          onCheckedChange={onSetRpiEnabled}
          disabled={rpiLoading}
          accessibilityLabel="RPi Camera"
        />
      </View>

      {rpiEnabled ? (
        <ProfileAction
          title="Manage cameras"
          subtitle="Add, edit, or remove connected cameras"
          onPress={onManageCameras}
        />
      ) : null}

      {rpiEnabled ? (
        <View style={styles.integrationRow}>
          <View style={styles.integrationIcon}>
            <Icon as={Radio} size={22} color={theme.colors.onSurfaceVariant} />
          </View>
          <View style={styles.integrationCopy}>
            <AppText style={styles.actionTitle}>YouTube Live</AppText>
            <AppText style={styles.actionSubtitle}>
              {youtubeAuthPending
                ? 'Connecting to Google…'
                : 'Stream product sessions live to YouTube.'}
            </AppText>
          </View>
          <Switch
            checked={youtubeEnabled}
            onCheckedChange={onToggleYouTube}
            disabled={youtubeLoading || youtubeAuthPending}
            accessibilityLabel="YouTube Live"
          />
        </View>
      ) : null}
    </View>
  );
}
