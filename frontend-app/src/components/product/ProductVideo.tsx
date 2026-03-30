import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { TextInput } from '@/components/base';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { useDialog } from '@/components/common/DialogProvider';
import { isValidUrl } from '@/services/api/validation/product';
import type { Product } from '@/types/Product';

interface Video {
  id?: number;
  url: string;
  title: string;
  description: string;
}

interface Props {
  product: Product;
  editMode: boolean;
  onVideoChange?: (videos: Video[]) => void;
}

export default function ProductVideo({ product, editMode, onVideoChange }: Props) {
  const [videos, setVideos] = useState<Video[]>(product.videos || []);
  const dialog = useDialog();
  const darkMode = useColorScheme() === 'dark';

  const handleVideoChange = (
    idx: number,
    field: 'url' | 'title' | 'description',
    value: string,
  ) => {
    const updated = videos.map((v, i) => (i === idx ? { ...v, [field]: value } : v));
    setVideos(updated);
    onVideoChange?.(updated);
  };

  const handleRemove = (idx: number) => {
    const updated = videos.filter((_, i) => i !== idx);
    setVideos(updated);
    onVideoChange?.(updated);
  };

  const handleAdd = () => {
    dialog.input({
      title: 'Add Recording',
      placeholder: 'Video URL',
      helperText: 'Paste a video URL (YouTube)',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'Add',
          disabled: (value) => !value?.trim() || !isValidUrl(value),
          onPress: (url) => {
            if (!url || !isValidUrl(url)) return;
            const updated = [...videos, { url: url.trim(), title: '', description: '' }];
            setVideos(updated);
            onVideoChange?.(updated);
          },
        },
      ],
    });
  };

  return (
    <View>
      <DetailSectionHeader
        title="Recordings"
        tooltipTitle="Add uploaded recordings of the disassembly."
        rightElement={
          editMode ? (
            <TouchableOpacity onPress={handleAdd} style={{ marginTop: 4 }}>
              <Text style={{ color: darkMode ? '#6dd5ed' : '#0062cc' }}>Add recording</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {videos.length === 0 && (
        <Text style={{ opacity: 0.7, marginBottom: 8, color: darkMode ? '#c0c8cd' : '#666666' }}>
          This product has no associated recordings.
        </Text>
      )}

      {videos.map((video, idx) => (
        <View
          key={video.id ?? idx}
          style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          <View style={{ flex: 1 }}>
            <TextInput
              style={{
                paddingHorizontal: 14,
                fontSize: 20,
                fontWeight: 'bold',
                lineHeight: 16,
                color: darkMode ? '#e1e2e4' : '#000000',
              }}
              placeholder={'Title'}
              value={video.title}
              onChangeText={(val) => handleVideoChange(idx, 'title', val)}
              editable={editMode}
              errorOnEmpty
            />
            {editMode ? (
              <TextInput
                style={{
                  paddingHorizontal: 14,
                  fontSize: 16,
                  lineHeight: 26,
                  color: darkMode ? '#e1e2e4' : '#000000',
                }}
                placeholder={'Video URL'}
                value={video.url}
                onChangeText={(val) => handleVideoChange(idx, 'url', val)}
                errorOnEmpty
                customValidation={isValidUrl}
                editable={editMode}
              />
            ) : (
              <TouchableOpacity onPress={() => Linking.openURL(video.url)}>
                <Text
                  style={{
                    paddingHorizontal: 14,
                    fontSize: 16,
                    lineHeight: 26,
                    color: darkMode ? '#6dd5ed' : '#0062cc',
                    textDecorationLine: 'underline',
                  }}
                >
                  {video.url}
                </Text>
              </TouchableOpacity>
            )}
            {(editMode || Boolean(video.description)) && (
              <TextInput
                style={{
                  paddingHorizontal: 14,
                  fontSize: 16,
                  lineHeight: 16,
                  color: darkMode ? '#e1e2e4' : '#000000',
                }}
                placeholder={'Add description (optional)'}
                value={video.description}
                onChangeText={(val) => handleVideoChange(idx, 'description', val)}
                editable={editMode}
              />
            )}
          </View>
          {editMode && (
            <TouchableOpacity
              testID={`delete-video-${idx}`}
              onPress={() => handleRemove(idx)}
              style={{
                padding: 14,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons name="delete" size={24} color="red" />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}
