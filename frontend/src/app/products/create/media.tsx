import { useProductCreationStore, type MediaItem } from '@/lib/stores/productCreationStore';
import { Screen } from '@/lib/ui/components/Screen';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, IconButton, Text, TextInput } from 'react-native-paper';

export default function CreateProductMedia() {
  const router = useRouter();
  const { formData, addMediaItem, removeMediaItem } = useProductCreationStore();

  const [newMedia, setNewMedia] = useState({
    type: 'image' as const,
    name: '',
    description: '',
  });

  const handleAddMediaItem = () => {
    if (newMedia.name.trim()) {
      const newItem: MediaItem = {
        id: Date.now().toString(),
        type: newMedia.type,
        name: newMedia.name.trim(),
        description: newMedia.description.trim(),
      };
      addMediaItem(newItem);
      setNewMedia({ type: 'image', name: '', description: '' });
    }
  };

  const handleNext = () => {
    router.push('/products/create/review');
  };

  const getMediaIcon = (type: MediaItem['type']) => {
    switch (type) {
      case 'image':
        return '📷';
      case 'video':
        return '🎥';
      case 'document':
        return '📄';
    }
  };

  return (
    <Screen>
      <Stack.Screen name="media" options={{ title: 'Register New Product' }} />

      <Card>
        <Card.Content style={{ gap: 16 }}>
          <View>
            <Text variant="headlineMedium">Attach Media</Text>
            <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: 4 }}>
              Step 3 of 4: Add images, videos, or documents for your product
            </Text>
          </View>

          {/* Demo Notice */}
          <Card style={{ backgroundColor: '#e3f2fd' }}>
            <Card.Content>
              <Text variant="bodyMedium" style={{ color: '#1565c0' }}>
                📎 File upload functionality will be available at launch. For now, you can specify media details.
              </Text>
            </Card.Content>
          </Card>

          {/* Add Media Form */}
          <Card style={{ backgroundColor: '#f8f9fa' }}>
            <Card.Content style={{ gap: 12 }}>
              <Text variant="titleMedium">Add Media Item</Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {(['image', 'video', 'document'] as const).map((type) => (
                  <Chip
                    key={type}
                    selected={newMedia.type === type}
                    onPress={() => setNewMedia({ ...newMedia, type })}
                    mode={newMedia.type === type ? 'flat' : 'outlined'}
                  >
                    {getMediaIcon(type)} {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Chip>
                ))}
              </View>

              <TextInput
                label="File Name"
                mode="outlined"
                value={newMedia.name}
                onChangeText={(name) => setNewMedia({ ...newMedia, name })}
                placeholder={`e.g., product-${newMedia.type}-01.${newMedia.type === 'image' ? 'jpg' : newMedia.type === 'video' ? 'mp4' : 'pdf'}`}
                placeholderTextColor="#757575"
              />

              <TextInput
                label="Description (Optional)"
                mode="outlined"
                value={newMedia.description}
                onChangeText={(description) => setNewMedia({ ...newMedia, description })}
                placeholder="Describe what this media shows..."
                placeholderTextColor="#757575"
                multiline
                numberOfLines={2}
              />

              <Button mode="contained" onPress={handleAddMediaItem} disabled={!newMedia.name.trim()} compact>
                Add {newMedia.type}
              </Button>
            </Card.Content>
          </Card>

          {/* Media Items List */}
          {formData.media.length > 0 && (
            <Card>
              <Card.Content style={{ gap: 8 }}>
                <Text variant="titleMedium">Media Items ({formData.media.length})</Text>

                {formData.media.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: formData.media.indexOf(item) < formData.media.length - 1 ? 1 : 0,
                      borderBottomColor: '#e0e0e0',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text variant="bodyLarge">{getMediaIcon(item.type)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyMedium">{item.name}</Text>
                          {item.description && (
                            <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                              {item.description}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                    <IconButton icon="delete" size={20} onPress={() => removeMediaItem(item.id)} />
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <Button mode="outlined" onPress={() => router.back()} style={{ flex: 1 }}>
              Back
            </Button>

            <Button
              mode="contained"
              onPress={handleNext}
              style={{ flex: 1 }}
              icon="arrow-right"
              contentStyle={{ flexDirection: 'row-reverse' }}
            >
              Review & Submit
            </Button>
          </View>
        </Card.Content>
      </Card>
    </Screen>
  );
}
