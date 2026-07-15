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
    <Card style={styles.card}>
      <View style={styles.detailsContent}>
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
};

export function CameraDangerZone({ onDelete }: CameraDangerZoneProps) {
  return (
    <>
      <AppText variant="label" style={styles.sectionLabel}>
        DANGER ZONE
      </AppText>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <ActionRow
            label="Delete camera"
            subtitle="Permanently removes this camera and all its settings"
            icon="delete"
            onPress={onDelete}
            danger
          />
        </View>
      </Card>
    </>
  );
}
