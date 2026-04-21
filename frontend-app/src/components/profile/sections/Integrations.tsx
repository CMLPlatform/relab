import { openURL } from 'expo-linking';
import { View } from 'react-native';
import { Icon, Switch } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import { DOCS_URL } from '@/config';
import { ProfileAction, ProfileSectionHeader } from './shared';
import { profileSectionStyles as styles } from './styles';

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
  return (
    <>
      <ProfileSectionHeader title="Integrations" />
      <View style={styles.section}>
        <View style={styles.integrationRow}>
          <View style={styles.integrationIcon}>
            <Icon source="camera-wireless" size={22} color="#555" />
          </View>
          <View style={styles.integrationCopy}>
            <Text style={styles.actionTitle}>RPi Camera</Text>
            <Text style={styles.actionSubtitle}>
              Capture images with a Raspberry Pi camera during disassembly.{' '}
              <Text
                style={styles.docsLink}
                onPress={() => openURL(`${DOCS_URL}/user-guides/rpi-cam`)}
              >
                Learn more
              </Text>
            </Text>
          </View>
          <Switch value={rpiEnabled} onValueChange={onSetRpiEnabled} disabled={rpiLoading} />
        </View>

        {rpiEnabled ? (
          <ProfileAction
            title="Manage Cameras"
            subtitle="Add, edit, or remove connected cameras"
            onPress={onManageCameras}
          />
        ) : null}

        {rpiEnabled ? (
          <View style={styles.integrationRow}>
            <View style={styles.integrationIcon}>
              <Icon source="youtube" size={22} color="#555" />
            </View>
            <View style={styles.integrationCopy}>
              <Text style={styles.actionTitle}>YouTube Live</Text>
              <Text style={styles.actionSubtitle}>
                {youtubeAuthPending
                  ? 'Connecting to Google…'
                  : 'Stream product sessions live to YouTube.'}
              </Text>
            </View>
            <Switch
              value={youtubeEnabled}
              onValueChange={onToggleYouTube}
              disabled={youtubeLoading || youtubeAuthPending}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}
