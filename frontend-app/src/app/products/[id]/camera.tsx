import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

type searchParams = { id: string };

export default function ProductCamera() {
  const router = useRouter();
  const { id } = useLocalSearchParams<searchParams>();
  const compressionQuality = 0.5;

  // ImagePicker permissions (mobile + mobile web)
  const [cameraStatus, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [libraryStatus, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  // expo-camera permission (desktop web webcam)
  const [webCamPermission, requestWebCamPermission] = useCameraPermissions();
  const camRef = React.useRef<CameraView>(null);

  // Detect desktop web (mouse/trackpad pointer)
  const isDesktopWeb =
    Platform.OS === 'web' && typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;

  const handleImageResult = async (result: ImagePicker.ImagePickerResult) => {
    console.log('ImagePicker result:', result);
    if (!result.canceled && result.assets?.[0]?.uri) {
      await handleCapturedUri(result.assets[0].uri);
    } else {
      console.log('Image picking canceled');
      router.back();
    }
  };

  const handleCapturedUri = async (uri: string) => {
    console.log('Captured URI:', uri);
    await AsyncStorage.setItem('lastPhoto', uri);
    const params = { id: id, photoTaken: 'taken' };
    router.dismissTo({ pathname: '/products/[id]', params: params });
  };

  const ensureWebcamPermission = async () => {
    if (!webCamPermission?.granted) {
      const p = await requestWebCamPermission();
      if (!p.granted) {
        alert('Camera permission is required to take photos');
        return false;
      }
    }
    return true;
  };

  const takePhoto = async () => {
    console.log('takePhoto pressed. isDesktopWeb:', isDesktopWeb);

    if (isDesktopWeb) {
      // Desktop web: Capture from live webcam (expo-camera)
      const ok = await ensureWebcamPermission();
      if (!ok) return;
      try {
        const photo = await camRef.current?.takePictureAsync();
        if (photo?.uri) {
          await handleCapturedUri(photo.uri);
        } else {
          console.warn('No photo URI returned from webcam');
        }
      } catch (e) {
        console.error('Webcam capture error:', e);
      }
      return;
    }

    // Mobile / mobile web: Use ImagePicker camera
    if (cameraStatus?.status !== 'granted') {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        alert('Camera permission is required to take photos');
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: compressionQuality,
      mediaTypes: 'images',
    });
    await handleImageResult(result);
  };

  const pickFromGallery = async () => {
    console.log('pickFromGallery pressed');
    if (libraryStatus?.status !== 'granted') {
      const permission = await requestLibraryPermission();
      if (!permission.granted) {
        alert('Media library permission is required to choose photos');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: compressionQuality,
      mediaTypes: 'images',
    });
    await handleImageResult(result);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text variant="headlineSmall">Add Product Image</Text>
      </View>

      {isDesktopWeb && (
        <View style={{ flex: 1 }}>
          {webCamPermission?.granted ? (
            <CameraView ref={camRef} style={{ flex: 1, borderRadius: 8, overflow: 'hidden' }} facing="back" />
          ) : (
            <View style={styles.permissionBox}>
              <Text variant="bodyLarge" style={{ marginBottom: 12 }}>
                Allow camera access to take a photo
              </Text>
              <Button mode="contained" icon="camera" onPress={ensureWebcamPermission} style={styles.button}>
                Enable Camera
              </Button>
            </View>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <Button mode="contained" icon="camera" onPress={takePhoto} style={styles.button}>
          Take Photo
        </Button>
        <Button mode="contained" icon="image" onPress={pickFromGallery} style={styles.button}>
          Choose from Gallery
        </Button>
        <Button mode="text" onPress={() => router.back()} style={styles.button}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  actions: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  button: { marginVertical: 6, minWidth: 200 },
});
