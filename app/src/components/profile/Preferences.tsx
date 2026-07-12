import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { Icon, Switch } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import { useAppTheme } from '@/theme';
import type { ThemeMode, User } from '@/types/User';
import { createProfileSectionStyles } from './styles';

type ProfileSectionStyles = ReturnType<typeof createProfileSectionStyles>;
type VisibilityId = 'public' | 'community' | 'private';

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
            <ThemeModeOption
              key={mode}
              mode={mode}
              icon={icon}
              label={label}
              active={themeMode === mode}
              styles={styles}
              onSetThemeMode={onSetThemeMode}
            />
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
  const activeVisibility = profile.preferences.profile_visibility || 'public';

  return (
    <>
      <ProfileSectionHeader title="Profile visibility" />
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
              subtitle: 'Only signed-in users can see your profile.',
              icon: 'account-group',
            },
            {
              id: 'private',
              title: 'Private',
              subtitle: 'Only you can see your profile. Uploads are anonymous.',
              icon: 'eye-off',
            },
          ] as const
        ).map((option) => (
          <VisibilityOption
            key={option.id}
            option={option}
            isActive={activeVisibility === option.id}
            saving={visibilitySaving}
            theme={theme}
            styles={styles}
            onChangeVisibility={onChangeVisibility}
          />
        ))}
      </View>
    </>
  );
}

type ProfileEmailUpdatesSectionProps = {
  enabled: boolean;
  saving: boolean;
  onSetEnabled: (enabled: boolean) => void;
};

export function ProfileEmailUpdatesSection({
  enabled,
  saving,
  onSetEnabled,
}: ProfileEmailUpdatesSectionProps) {
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);

  return (
    <>
      <ProfileSectionHeader title="Email updates" />
      <View style={styles.section}>
        <View style={styles.newsletterRow}>
          <View style={styles.newsletterCopy}>
            <Text style={styles.actionTitle}>Receive ReLab account updates</Text>
            <Text style={styles.actionSubtitle}>
              Opt in to occasional product and project updates tied to your account.
            </Text>
            <Text style={styles.newsletterState}>
              {enabled ? 'Currently enabled.' : 'Currently disabled.'}
            </Text>
          </View>
          <Switch value={enabled} onValueChange={onSetEnabled} disabled={saving} />
        </View>
      </View>
    </>
  );
}

function ThemeModeOption({
  mode,
  icon,
  label,
  active,
  styles,
  onSetThemeMode,
}: {
  mode: ThemeMode;
  icon: string;
  label: string;
  active: boolean;
  styles: ProfileSectionStyles;
  onSetThemeMode: (mode: ThemeMode) => void;
}) {
  const handlePress = useCallback(() => onSetThemeMode(mode), [onSetThemeMode, mode]);

  return (
    <Pressable
      style={[styles.themeModeOption, active && styles.themeModeOptionActive]}
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} theme`}
    >
      <Icon source={icon} size={22} />
      <Text style={styles.themeModeLabel}>{label}</Text>
    </Pressable>
  );
}

function VisibilityOption({
  option,
  isActive,
  saving,
  theme,
  styles,
  onChangeVisibility,
}: {
  option: { id: VisibilityId; title: string; subtitle: string; icon: string };
  isActive: boolean;
  saving: boolean;
  theme: ReturnType<typeof useAppTheme>;
  styles: ProfileSectionStyles;
  onChangeVisibility: (visibility: VisibilityId) => void;
}) {
  const handlePress = useCallback(
    () => onChangeVisibility(option.id),
    [onChangeVisibility, option.id],
  );

  return (
    <Pressable
      style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
      onPress={handlePress}
      disabled={saving}
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
}
