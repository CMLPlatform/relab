import { Camera, CameraView } from 'expo-camera';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

interface Props {
  visible: boolean;
  onScanned: (code: string) => void;
  onClose: () => void;
}

/**
 * Full-screen modal QR scanner. Parses `relab-pair:XXXXXX` format
 * and falls back to treating the entire QR value as a code.
 *
 * Permission must be requested BEFORE opening this modal (from a click handler)
 * because browsers require a user gesture for getUserMedia.
 * Use `requestCameraAccess()` from the parent component.
 */
export default function QrScanner({ visible, onScanned, onClose }: Props) {
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const match = data.match(/^relab-pair:([A-Z0-9]{6})$/i);
    const code = match ? match[1]?.toUpperCase() : data.trim().toUpperCase();

    if (/^[A-Z0-9]{6}$/.test(code)) {
      onScanned(code);
      onClose();
    } else {
      setScanned(false);
    }
  };

  if (!visible) {
    if (scanned) setScanned(false);
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <CameraView
          style={{ flex: 1, width: '100%', height: '100%' }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        <View style={styles.overlay}>
          <Text style={styles.hint}>Point at the QR code on the RPi setup page</Text>
          <View style={styles.cutout} />
          <Text style={[styles.hint, { marginTop: 16, fontSize: 13, opacity: 0.7 }]}>
            Or type the 6-character code manually
          </Text>
        </View>

        <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close scanner">
          <Icon source="close" size={28} color="white" />
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * Request camera access. Must be called from a click/press handler
 * (browsers require a user gesture for getUserMedia).
 * Returns true if permission was granted.
 */
export async function requestCameraAccess(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (!navigator.mediaDevices?.getUserMedia) {
      // Not available (insecure context or unsupported browser)
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      stream.getTracks().forEach((t) => {
        t.stop();
      });
      return true;
    } catch (err) {
      console.warn('Camera access denied:', err);
      return false;
    }
  }
  const { granted } = await Camera.requestCameraPermissionsAsync();
  return granted;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cutout: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
