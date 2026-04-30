import { Card, Divider, Text } from 'react-native-paper';
import { YouTubeStreamCard } from '@/components/cameras/YouTubeStreamCard';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { ActionRow, DetailRow } from './shared';
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
      <Card.Content style={styles.detailsContent}>
        <DetailRow label="Name" value={camera.name} onEdit={onEditName} />
        <Divider />
        <DetailRow
          label="Description"
          value={camera.description ?? '—'}
          onEdit={onEditDescription}
        />
        <Divider />
        <DetailRow label="Key ID" value={camera.relay_key_id} mono />
        <Divider />
        <DetailRow label="Camera ID" value={camera.id} mono />
      </Card.Content>
    </Card>
  );
}

type CameraDangerZoneProps = {
  onDelete: () => void;
};

export function CameraDangerZone({ onDelete }: CameraDangerZoneProps) {
  return (
    <>
      <Text style={styles.sectionLabel}>DANGER ZONE</Text>
      <Card style={styles.card}>
        <Card.Content>
          <ActionRow
            label="Delete camera"
            subtitle="Permanently removes this camera and all its settings"
            icon="delete"
            onPress={onDelete}
            danger
          />
        </Card.Content>
      </Card>
    </>
  );
}
