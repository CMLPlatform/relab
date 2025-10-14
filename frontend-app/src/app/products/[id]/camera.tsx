import { useDialog } from '@/components/common/DialogProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

type searchParams = { id: string };

export default function ProductCamera() {
  // Hooks
  const dialog = useDialog();
  const router = useRouter();

  const { id } = useLocalSearchParams<searchParams>();

  // Image processing settings
  const maxWidth = 1920; // Max width in pixels
  const maxHeight = 1920; // Max height in pixels
  const compressionQuality = 0.8; // 80% quality
  const maxImageSizeMB = 10;
  const maxImageSizeBytes = maxImageSizeMB * 1024 * 1024;

  // ImagePicker permissions (mobile + mobile web)
  const [cameraStatus, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [libraryStatus, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  // expo-camera permission (desktop web webcam)
  const [webCamPermission, requestWebCamPermission] = useCameraPermissions();
  const camRef = React.useRef<CameraView>(null);

  // Detect desktop web (mouse/trackpad pointer)
  const isDesktopWeb =
    Platform.OS === 'web' && typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;

  const processImage = async (asset: ImagePicker.ImagePickerAsset): Promise<string> => {
    try {
      console.log('Processing image:', asset.uri);

      // Get image information
      const { width, height, fileSize, uri } = asset;

      console.log('Original dimensions:', width, 'x', height);

      // Validate file size
      // TODO: Deal with undefined file sizes
      if (fileSize !== undefined && fileSize > maxImageSizeBytes) {
        const mb = (fileSize / (1024 * 1024)).toFixed(2);
        await dialog.alert({
          title: 'Image too large',
          message: `Max size is ${maxImageSizeMB} MB.\nSelected image size: ${mb} MB.`,
        });
        throw new Error(`Image too large: ${fileSize} bytes`);
      }

      // Check if resizing is needed
      const needsResize = width > maxWidth || height > maxHeight;

      const manipulator = ImageManipulator.manipulate(uri);

      if (needsResize) {
        let newWidth: number | undefined;
        let newHeight: number | undefined;

        if (width > height) {
          newWidth = Math.min(width, maxWidth);
        } else {
          newHeight = Math.min(height, maxHeight);
        }

        if (newWidth) {
          manipulator.resize({ width: newWidth });
        } else if (newHeight) {
          manipulator.resize({ height: newHeight });
        }

        console.log('Resizing to:', newWidth || 'auto', 'x', newHeight || 'auto');
      }

      const rendered = await manipulator.renderAsync();
      const compressed = await rendered.saveAsync({ compress: compressionQuality });

      console.log('Image processed. New URI:', compressed.uri);
      return compressed.uri;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  };

  const handleImageResult = async (result: ImagePicker.ImagePickerResult) => {
    console.log('ImagePicker result:', result);
    if (!result.canceled && result.assets?.[0]) {
      try {
        const processedUri = await processImage(result.assets[0]);
        await handleCapturedUri(processedUri);
      } catch (error) {
        console.error('Failed to process image:', error);
        router.back();
      }
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
        await dialog.alert({
          title: 'Permission Required',
          message: 'Camera permission is required to take photos',
        });
        return false;
      }
    }
    return true;
  };

  const takePhoto = async () => {
    console.log('takePhoto pressed. isDesktopWeb:', isDesktopWeb);

    if (isDesktopWeb) {
      // Desktop web: Capture from webcam
      // TODO: Consider removing webcam image capture for dekstop to simplify
      // and avoid issues with multiple camera permissions in browser
      // (expo-camera + ImagePicker)
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
        await dialog.alert({
          title: 'Permission Required',
          message: 'Camera permission is required to take photos',
        });
        return;
      }
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        mediaTypes: 'images',
      });
      await handleImageResult(result);
    } catch (error: any) {
      console.error('Camera error:', error);
      if (error.message?.includes('Unsupported file type')) {
        await dialog.alert({
          title: 'Unsupported file',
          message: 'Please select an image file.',
        });
      }
    }
  };

  const pickFromGallery = async () => {
    console.log('pickFromGallery pressed');
    if (libraryStatus?.status !== 'granted') {
      const permission = await requestLibraryPermission();
      if (!permission.granted) {
        await dialog.alert({
          title: 'Permission Required',
          message: 'Media library permission is required to choose photos',
        });
        return;
      }
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        mediaTypes: 'images',
      });
      await handleImageResult(result);
    } catch (error: any) {
      console.error('Gallery picker error:', error);
      if (error.message?.includes('Unsupported file type')) {
        await dialog.alert({
          title: 'Unsupported file',
          message: 'Please select an image file. PDFs and other documents are not supported.',
        });
      }
    }
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
