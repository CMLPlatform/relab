import type { LucideIcon } from 'lucide-react-native';
import { Check, EyeOff, Globe, Moon, Sun, SunMoon, Users } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/ui/icon';
import { Switch } from '@/components/base/ui/switch';
import { useAppTheme } from '@/theme';
import type { ThemeMode, User } from '@/types/User';
import { createProfileSectionStyles } from './styles';

type ProfileSectionStyles = ReturnType<typeof createProfileSectionStyles>;
type VisibilityId = 'public' | 'community' | 'private';

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
    <View style={styles.section}>
      <View style={styles.themeModeRow}>
        {(
          [
            { mode: 'auto', icon: SunMoon, label: 'Auto' },
            { mode: 'light', icon: Sun, label: 'Light' },
            { mode: 'dark', icon: Moon, label: 'Dark' },
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
    <View style={styles.section}>
      {(
        [
          {
            id: 'public',
            title: 'Public',
            subtitle: 'Visible to everyone. Best for sharing your work.',
            icon: Globe,
          },
          {
            id: 'community',
            title: 'Community',
            subtitle: 'Only signed-in users can see your profile.',
            icon: Users,
          },
          {
            id: 'private',
            title: 'Private',
            subtitle: 'Only you can see your profile. Uploads are anonymous.',
            icon: EyeOff,
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
    <View style={styles.section}>
      <View style={styles.newsletterRow}>
        <View style={styles.newsletterCopy}>
          <AppText style={styles.actionTitle}>Receive ReLab account updates</AppText>
          <AppText style={styles.actionSubtitle}>
            Opt in to occasional product and project updates tied to your account.
          </AppText>
          <AppText style={styles.newsletterState}>
            {enabled ? 'Currently enabled.' : 'Currently disabled.'}
          </AppText>
        </View>
        <Switch
          checked={enabled}
          onCheckedChange={onSetEnabled}
          disabled={saving}
          accessibilityLabel="Receive ReLab account updates"
        />
      </View>
    </View>
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
  icon: LucideIcon;
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
      <Icon as={icon} size={22} />
      <AppText style={styles.themeModeLabel}>{label}</AppText>
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
  option: { id: VisibilityId; title: string; subtitle: string; icon: LucideIcon };
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
          as={option.icon}
          size={24}
          color={isActive ? theme.colors.primary : theme.tokens.text.muted}
        />
      </View>
      <View style={styles.actionCopy}>
        <AppText style={[styles.actionTitle, isActive && { color: theme.colors.primary }]}>
          {option.title}
        </AppText>
        <AppText style={styles.actionSubtitle}>{option.subtitle}</AppText>
      </View>
      {isActive ? <Icon as={Check} size={20} color={theme.colors.primary} /> : null}
    </Pressable>
  );
}
