import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { IconButton } from '@/components/base/IconButton';
import { useAppTheme } from '@/theme';
import { cameraDetailStyles } from './styles';

type CameraDetailLayoutProps = {
  children: ReactNode;
};

export function CameraDetailLayout({ children }: CameraDetailLayoutProps) {
  return <ScrollView contentContainerStyle={styles.container}>{children}</ScrollView>;
}

export function DetailRow({
  label,
  value,
  onEdit,
  mono = false,
}: {
  label: string;
  value: string;
  onEdit?: () => void;
  mono?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <View style={styles.detailRow}>
      <AppText variant="label" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText
        selectable
        numberOfLines={1}
        style={[
          styles.detailValue,
          { color: theme.colors.onSurface },
          mono ? styles.monoDetail : null,
        ]}
      >
        {value}
      </AppText>
      {onEdit ? (
        <IconButton
          icon="pencil"
          size={16}
          onPress={onEdit}
          accessibilityLabel={`Edit ${label.toLowerCase()}`}
        />
      ) : null}
    </View>
  );
}

export function ActionRow({
  label,
  subtitle,
  icon,
  onPress,
  danger = false,
  loading = false,
}: {
  label: string;
  subtitle?: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const theme = useAppTheme();
  const color = danger ? theme.colors.error : theme.colors.onSurface;

  return (
    <AppButton
      variant="ghost"
      onPress={onPress}
      loading={loading}
      disabled={loading}
      className="w-full justify-start"
    >
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <View>
        <AppText style={[styles.actionLabel, { color }]}>{label}</AppText>
        {subtitle ? (
          <AppText variant="body" style={styles.actionSubtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </AppButton>
  );
}

const styles = cameraDetailStyles;
