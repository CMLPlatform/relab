import type { ReactNode, RefObject } from 'react';
import { ScrollView, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import { IconButton } from '@/components/base/IconButton';
import { PageContainer } from '@/components/base/PageContainer';
import { useAppTheme } from '@/theme';
import { cameraDetailStyles } from './styles';

type CameraDetailLayoutProps = {
  children: ReactNode;
};

export function CameraDetailLayout({ children }: CameraDetailLayoutProps) {
  return (
    <ScrollView contentContainerClassName="pt-3 pb-12">
      <PageContainer>
        <View className="gap-3">{children}</View>
      </PageContainer>
    </ScrollView>
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
    <View className="flex-row items-center gap-2 py-2.5">
      <AppText variant="label" className="w-[100px] opacity-55">
        {label}
      </AppText>
      <AppText
        selectable
        numberOfLines={1}
        className="flex-1"
        style={[{ color: theme.colors.onSurface }, mono ? styles.monoDetail : null]}
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
  triggerRef,
}: {
  label: string;
  subtitle?: string;
  icon: IconName;
  onPress: () => void;
  danger?: boolean;
  /** Return-focus target for the dialog `onPress` opens; see AppDialog's `triggerRef`. */
  triggerRef?: RefObject<View | null>;
}) {
  const theme = useAppTheme();
  const color = danger ? theme.colors.error : theme.colors.onSurface;

  return (
    <View ref={triggerRef} collapsable={false}>
      <AppButton variant="ghost" onPress={onPress} className="w-full justify-start">
        <Icon name={icon} size={18} color={color} />
        <View>
          <AppText className="font-semibold" style={{ color }}>
            {label}
          </AppText>
          {subtitle ? (
            <AppText variant="body" className="mt-px opacity-60">
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </AppButton>
    </View>
  );
}

const styles = cameraDetailStyles;
