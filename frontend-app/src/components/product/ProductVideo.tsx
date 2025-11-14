import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { InfoTooltip, TextInput } from '@/components/base';
import { useDialog } from '@/components/common/DialogProvider';
import { Product } from '@/types/Product';

interface Video {
    id?: number;
    url: string;
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

    const handleVideoChange = (idx: number, field: 'url' | 'description', value: string) => {
        const updated = videos.map((v, i) => i === idx ? { ...v, [field]: value } : v);
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
                    disabled: (value) => !value || !value.trim(),
                    onPress: (url) => {
                        if (!url) return;
                        const updated = [...videos, { url: url.trim(), description: '' }];
                        console.log(videos)
                        setVideos(updated);
                        onVideoChange?.(updated);
                    }
                }
            ]
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
                    paddingHorizontal: 14
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
                <Text style={{ paddingHorizontal: 14, opacity: 0.7, marginBottom: 8 }}>This product has no associated recordings.</Text>
            )}

            {videos.map((video, idx) => (
                <View key={video.id ?? idx} style={{ marginBottom: 16 }}>
                    <TextInput
                        style={{ padding: 14, fontSize: 16, lineHeight: 26 }}
                        placeholder={'Video URL'}
                        value={video.url}
                        onChangeText={val => handleVideoChange(idx, 'url', val)}
                        errorOnEmpty
                        editable={editMode}
                    />
                    {(editMode || Boolean(video.description)) && <TextInput
                        style={{ paddingHorizontal: 14, fontSize: 16, lineHeight: 16 }}
                        placeholder={'Add description (optional)'}
                        value={video.description}
                        onChangeText={val => handleVideoChange(idx, 'description', val)}
                        editable={editMode}
                    />}
                    {editMode && (
                        <TouchableOpacity onPress={() => handleRemove(idx)} style={{ marginTop: 4, paddingHorizontal: 14 }}>
                            <Text style={{ color: 'red', textAlign: 'right' }}>Remove</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ))}
        </View>
    );
}
