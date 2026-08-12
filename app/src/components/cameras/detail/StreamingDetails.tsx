import type { RefObject } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Separator } from '@/components/base/ui/separator';
import { YouTubeStreamCard } from '@/components/cameras/YouTubeStreamCard';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { ActionRow, DetailRow } from './detailRows';
import { cameraDetailStyles as styles } from './styles';

type CameraStreamingSectionProps = {
  cameraId: string;
  isOnline: boolean;
};

export function CameraStreamingSection({ cameraId, isOnline }: CameraStreamingSectionProps) {
  if (!isOnline) return null;
  return <YouTubeStreamCard cameraId={cameraId} isOnline={isOnline} />;
}

type CameraDetailsCardProps = {
  camera: CameraReadWithStatus;
  onEditName: () => void;
  onEditDescription: () => void;
};

export function CameraDetailsCard({
  camera,
  onEditName,
  onEditDescription,
}: CameraDetailsCardProps) {
  return (
    <Card>
      <View className="p-4">
        <DetailRow label="Name" value={camera.name} onEdit={onEditName} />
        <Separator />
        <DetailRow
          label="Description"
          value={camera.description ?? '—'}
          onEdit={onEditDescription}
        />
        <Separator />
        <DetailRow label="Key ID" value={camera.relay_key_id} mono />
        <Separator />
        <DetailRow label="Camera ID" value={camera.id} mono />
      </View>
    </Card>
  );
}

type CameraDangerZoneProps = {
  onDelete: () => void;
  deleteTriggerRef?: RefObject<View | null>;
};

export function CameraDangerZone({ onDelete, deleteTriggerRef }: CameraDangerZoneProps) {
  return (
    <>
      <AppText variant="label" style={styles.sectionLabel} className="px-1 uppercase opacity-45">
        DANGER ZONE
      </AppText>
      <Card>
        <View className="p-4">
          <ActionRow
            label="Delete camera"
            subtitle="Permanently removes this camera and all its settings"
            icon="trash-2"
            onPress={onDelete}
            danger
            triggerRef={deleteTriggerRef}
          />
        </View>
      </Card>
    </>
  );
}
