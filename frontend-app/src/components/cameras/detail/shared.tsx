import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Text } from 'react-native-paper';
import { cameraDetailStyles } from '@/components/cameras/detail/styles';
import { useAppTheme } from '@/theme';

type CameraDetailLayoutProps = {
  children: ReactNode;
};

export function CameraDetailLayout({ children }: CameraDetailLayoutProps) {
  return <ScrollView contentContainerStyle={styles.container}>{children}</ScrollView>;
}

export function CameraDetailLoadingState() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
    </View>
  );
}

type CameraDetailErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function CameraDetailErrorState({ message, onRetry }: CameraDetailErrorStateProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.center}>
      <Text style={{ color: theme.colors.error, fontSize: 48 }}>!</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Button mode="contained" onPress={onRetry} style={styles.retryButton}>
        Retry
      </Button>
    </View>
  );
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
      <Text variant="labelSmall" style={styles.detailLabel}>
        {label}
      </Text>
      <Text
        selectable
        numberOfLines={1}
        style={[
          styles.detailValue,
          { color: theme.colors.onSurface },
          mono ? styles.monoDetail : null,
        ]}
      >
        {value}
      </Text>
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
  icon: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  const theme = useAppTheme();
  const color = danger ? theme.colors.error : theme.colors.onSurface;

  return (
    <Button
      mode="text"
      icon={icon}
      onPress={onPress}
      loading={loading}
      disabled={loading}
      textColor={color}
      style={styles.stretchButton}
      contentStyle={styles.actionButtonContent}
    >
      <View>
        <Text style={[styles.actionLabel, { color }]}>{label}</Text>
        {subtitle ? (
          <Text variant="bodySmall" style={styles.actionSubtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Button>
  );
}

const styles = cameraDetailStyles;
