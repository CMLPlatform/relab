import { useCallback } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
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
    <View className="mx-1">
      <View className="flex-row items-center gap-3 px-4 py-2.5">
        <View className="w-8 items-center">
          <Icon name="webcam" size={22} color={theme.colors.onSurfaceVariant} />
        </View>
        <View className="flex-1">
          <AppText className="font-semibold">RPi Camera</AppText>
          <AppText className="mt-px text-[13px] text-muted-foreground">
            Capture images with a Raspberry Pi camera during disassembly.{' '}
            <AppText className="underline" style={styles.docsLink} onPress={openDocs}>
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
        <View className="flex-row items-center gap-3 px-4 py-2.5">
          <View className="w-8 items-center">
            <Icon name="radio" size={22} color={theme.colors.onSurfaceVariant} />
          </View>
          <View className="flex-1">
            <AppText className="font-semibold">YouTube Live</AppText>
            <AppText className="mt-px text-[13px] text-muted-foreground">
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
