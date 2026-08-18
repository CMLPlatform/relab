import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { Switch } from '@/components/base/ui/switch';
import { useAppTheme } from '@/theme';
import { palette } from '@/theme/palette.generated';
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
  const theme = useAppTheme();
  const styles = createProfileSectionStyles(theme);
  return (
    <View className="mx-1">
      <View className="flex-row gap-2 px-4 py-2.5">
        {(
          [
            { mode: 'auto', icon: 'sun-moon', label: 'Auto' },
            { mode: 'light', icon: 'sun', label: 'Light' },
            { mode: 'dark', icon: 'moon', label: 'Dark' },
          ] as const
        ).map(({ mode, icon, label }) => (
          <ThemeModeOption
            key={mode}
            mode={mode}
            icon={icon}
            label={label}
            active={themeMode === mode}
            styles={styles}
            color={theme.colors.onSurface}
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
    <View className="mx-1">
      {(
        [
          {
            id: 'public',
            title: 'Public',
            subtitle: 'Visible to everyone. Best for sharing your work.',
            icon: 'globe',
          },
          {
            id: 'community',
            title: 'Community',
            subtitle: 'Only signed-in users can see your profile.',
            icon: 'users',
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
  return (
    <View className="mx-1">
      <View className="flex-row items-start justify-between gap-3 px-4 py-2.5">
        <View className="flex-1">
          <AppText className="font-semibold">Receive Relab account updates</AppText>
          <AppText className="mt-px text-[13px] text-muted-foreground">
            Occasional news about Relab and the research project, sent to your account email.
          </AppText>
          <AppText className="mt-1.5 text-[13px] font-semibold">
            {enabled ? 'Currently enabled.' : 'Currently disabled.'}
          </AppText>
        </View>
        <Switch
          checked={enabled}
          onCheckedChange={onSetEnabled}
          disabled={saving}
          accessibilityLabel="Receive Relab account updates"
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
  color,
  onSetThemeMode,
}: {
  mode: ThemeMode;
  icon: IconName;
  label: string;
  active: boolean;
  styles: ProfileSectionStyles;
  color: string;
  onSetThemeMode: (mode: ThemeMode) => void;
}) {
  const handlePress = useCallback(() => onSetThemeMode(mode), [onSetThemeMode, mode]);

  return (
    <Pressable
      className="flex-1 items-center gap-1.5 rounded-lg border py-3"
      style={[styles.themeModeOption, active && styles.themeModeOptionActive]}
      onPress={handlePress}
      accessibilityRole="radio"
      // `checked` is the required state for role=radio (RN Web maps it to
      // aria-checked); `selected` alone emits aria-selected, which ARIA does not
      // accept on a radio, so screen readers could not report the active theme.
      accessibilityState={{ checked: active, selected: active }}
      accessibilityLabel={`${label} theme`}
    >
      <Icon name={icon} size={22} color={color} />
      <AppText className="text-[12px] font-semibold">{label}</AppText>
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
  option: { id: VisibilityId; title: string; subtitle: string; icon: IconName };
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
      className="my-0.5 flex-row items-center gap-3 rounded-lg px-4 py-3"
      style={isActive ? styles.visibilityOptionActive : undefined}
      onPress={handlePress}
      disabled={saving}
      accessibilityRole="radio"
      // See the theme option above: role=radio requires aria-checked.
      accessibilityState={{ checked: isActive, selected: isActive }}
    >
      <View className="w-8 items-center">
        <Icon
          name={option.icon}
          size={24}
          color={isActive ? theme.colors.primary : palette[theme.scheme].mutedForeground}
        />
      </View>
      <View className="flex-1">
        <AppText
          className="font-semibold"
          style={isActive ? { color: theme.colors.primary } : undefined}
        >
          {option.title}
        </AppText>
        <AppText className="mt-px text-[13px] text-muted-foreground">{option.subtitle}</AppText>
      </View>
      {isActive ? <Icon name="check" size={20} color={theme.colors.primary} /> : null}
    </Pressable>
  );
}
