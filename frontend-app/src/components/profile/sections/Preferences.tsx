import { Pressable, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import { createProfileSectionStyles } from '@/components/profile/sections/styles';
import { useAppTheme } from '@/theme';
import type { ThemeMode, User } from '@/types/User';
import { ProfileSectionHeader } from './shared';

type ProfileAppearanceSectionProps = {
  themeMode: ThemeMode;
  onSetThemeMode: (mode: ThemeMode) => void;
};

export function ProfileAppearanceSection({
  themeMode,
  onSetThemeMode,
}: ProfileAppearanceSectionProps) {
  const styles = createProfileSectionStyles(useAppTheme());
  return (
    <>
      <ProfileSectionHeader title="Appearance" />
      <View style={styles.section}>
        <View style={styles.themeModeRow}>
          {(
            [
              { mode: 'auto', icon: 'theme-light-dark', label: 'Auto' },
              { mode: 'light', icon: 'white-balance-sunny', label: 'Light' },
              { mode: 'dark', icon: 'moon-waning-crescent', label: 'Dark' },
            ] as const
          ).map(({ mode, icon, label }) => (
            <Pressable
              key={mode}
              style={[styles.themeModeOption, themeMode === mode && styles.themeModeOptionActive]}
              onPress={() => onSetThemeMode(mode)}
              accessibilityRole="radio"
              accessibilityState={{ selected: themeMode === mode }}
              accessibilityLabel={`${label} theme`}
            >
              <Icon source={icon} size={22} />
              <Text style={styles.themeModeLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </>
  );
}

type ProfileVisibilitySectionProps = {
  profile: User;
  visibilitySaving: boolean;
  onChangeVisibility: (visibility: 'public' | 'community' | 'private') => void;
};

export function ProfileVisibilitySection({
  profile,
  visibilitySaving,
  onChangeVisibility,
}: ProfileVisibilitySectionProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  const activeVisibility = profile.preferences?.profile_visibility || 'public';

  return (
    <>
      <ProfileSectionHeader title="Profile Visibility" />
      <View style={styles.section}>
        {(
          [
            {
              id: 'public',
              title: 'Public',
              subtitle: 'Visible to everyone. Best for sharing your work.',
              icon: 'earth',
            },
            {
              id: 'community',
              title: 'Community',
              subtitle: 'Only logged-in users can see your profile.',
              icon: 'account-group',
            },
            {
              id: 'private',
              title: 'Private',
              subtitle: 'Only you can see your profile. Uploads are anonymous.',
              icon: 'eye-off',
            },
          ] as const
        ).map((option) => {
          const isActive = activeVisibility === option.id;

          return (
            <Pressable
              key={option.id}
              style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
              onPress={() => onChangeVisibility(option.id)}
              disabled={visibilitySaving}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
            >
              <View style={styles.visibilityIcon}>
                <Icon
                  source={option.icon}
                  size={24}
                  color={isActive ? theme.colors.primary : theme.tokens.text.muted}
                />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionTitle, isActive && { color: theme.colors.primary }]}>
                  {option.title}
                </Text>
                <Text style={styles.actionSubtitle}>{option.subtitle}</Text>
              </View>
              {isActive ? <Icon source="check" size={20} color={theme.colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
