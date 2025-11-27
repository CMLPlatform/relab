import { InfoTooltip, TextInput } from '@/components/base';
import { useDialog } from '@/components/common/DialogProvider';
import { isValidUrl } from '@/services/api/validation/product';
import { Product } from '@/types/Product';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';

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

  const handleVideoChange = (idx: number, field: 'url' | 'title' | 'description', value: string) => {
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
          disabled: (value) => !value || !value.trim() || !isValidUrl(value),
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
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingHorizontal: 14,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: 'bold',
          }}
        >
          Recordings <InfoTooltip title="Add uploaded recordings of the disassembly." />
        </Text>
        {editMode && (
          <TouchableOpacity onPress={handleAdd} style={{ marginTop: 4 }}>
            <Text style={{ color: 'blue' }}>Add recording</Text>
          </TouchableOpacity>
        )}
      </View>

      {videos.length === 0 && (
        <Text style={{ paddingHorizontal: 14, opacity: 0.7, marginBottom: 8 }}>
          This product has no associated recordings.
        </Text>
      )}

      {videos.map((video, idx) => (
        <View key={video.id ?? idx} style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <TextInput
              style={{ paddingHorizontal: 14, fontSize: 20, fontWeight: 'bold', lineHeight: 16 }}
              placeholder={'Title'}
              value={video.title}
              onChangeText={(val) => handleVideoChange(idx, 'title', val)}
              editable={editMode}
              errorOnEmpty
            />
            {editMode ? (
              <TextInput
                style={{ paddingHorizontal: 14, fontSize: 16, lineHeight: 26 }}
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
                    color: 'blue',
                    textDecorationLine: 'underline',
                  }}
                >
                  {video.url}
                </Text>
              </TouchableOpacity>
            )}
            {(editMode || Boolean(video.description)) && (
              <TextInput
                style={{ paddingHorizontal: 14, fontSize: 16, lineHeight: 16 }}
                placeholder={'Add description (optional)'}
                value={video.description}
                onChangeText={(val) => handleVideoChange(idx, 'description', val)}
                editable={editMode}
              />
            )}
          </View>
          {editMode && (
            <TouchableOpacity
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
