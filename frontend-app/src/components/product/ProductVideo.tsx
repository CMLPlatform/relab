import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Button, Icon } from 'react-native-paper';
import { TextInput } from '@/components/base/TextInput';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { useDialog } from '@/components/common/DialogProvider';
import { StreamingContent } from '@/components/common/StreamingContent';
import type { StreamSession } from '@/context/StreamSessionContext';
import { useEffectiveColorScheme } from '@/context/ThemeModeProvider';
import { extractYouTubeVideoId, isValidUrl } from '@/services/api/validation/productSchema';
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
  streamingThisProduct: boolean;
  streamingOtherProduct: boolean;
  activeStream: StreamSession | null;
  rpiEnabled: boolean;
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  ownedByMe: boolean;
  isNew: boolean;
  isProductComponent: boolean;
  onGoLivePress: () => void;
  onNavigateToProfile: () => void;
  onNavigateToActiveStream: () => void;
}

export default function ProductVideo({
  product,
  editMode,
  onVideoChange,
  streamingThisProduct,
  streamingOtherProduct,
  activeStream,
  rpiEnabled,
  youtubeEnabled,
  isGoogleLinked,
  ownedByMe,
  isNew,
  isProductComponent,
  onGoLivePress,
  onNavigateToProfile,
  onNavigateToActiveStream,
}: Props) {
  const [videos, setVideos] = useState<Video[]>(product.videos || []);
  const [expanded, setExpanded] = useState(false);
  const dialog = useDialog();
  const darkMode = useEffectiveColorScheme() === 'dark';

  useEffect(() => {
    if (streamingThisProduct) setExpanded(true);
  }, [streamingThisProduct]);

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
      title: 'Add Video',
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

  const handleGoLivePress = () => {
    if (streamingOtherProduct && activeStream) {
      dialog.alert({
        title: 'Already streaming',
        message: `You're currently live on "${activeStream.productName}". Stop that stream before starting a new one.`,
        buttons: [{ text: 'OK' }, { text: 'Go to stream', onPress: onNavigateToActiveStream }],
      });
      return;
    }
    onGoLivePress();
  };

  const showGoLiveCta =
    !isNew && ownedByMe && rpiEnabled && !streamingThisProduct && !isProductComponent;

  const showExpandToggle = !editMode && videos.length > 0;

  return (
    <View>
      <DetailSectionHeader
        title="Video"
        tooltipTitle="Add uploaded recordings or start a live stream."
        rightElement={
          editMode ? (
            <TouchableOpacity onPress={handleAdd} style={{ marginTop: 4 }}>
              <Text style={{ color: darkMode ? '#6dd5ed' : '#0062cc' }}>Add video</Text>
            </TouchableOpacity>
          ) : showExpandToggle ? (
            <Pressable onPress={() => setExpanded((v) => !v)} style={{ marginTop: 4 }}>
              <Text style={{ color: darkMode ? '#6dd5ed' : '#0062cc' }}>
                {expanded ? 'Hide' : `Show (${videos.length})`}
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      {streamingThisProduct && activeStream ? (
        <StreamingContent session={activeStream} showProductLink={false} />
      ) : null}

      {showGoLiveCta ? (
        <GoLiveCTA
          youtubeEnabled={youtubeEnabled}
          isGoogleLinked={isGoogleLinked}
          onGoLivePress={handleGoLivePress}
          onNavigateToProfile={onNavigateToProfile}
          darkMode={darkMode}
        />
      ) : null}

      {(editMode || expanded) &&
        videos.map((video, idx) => (
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
                placeholder="Title"
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
                  placeholder="Video URL"
                  value={video.url}
                  onChangeText={(val) => handleVideoChange(idx, 'url', val)}
                  errorOnEmpty
                  customValidation={isValidUrl}
                  editable={editMode}
                />
              ) : (
                <VideoEmbed url={video.url} darkMode={darkMode} />
              )}
              {(editMode || Boolean(video.description)) && (
                <TextInput
                  style={{
                    paddingHorizontal: 14,
                    fontSize: 16,
                    lineHeight: 16,
                    color: darkMode ? '#e1e2e4' : '#000000',
                  }}
                  placeholder="Add description (optional)"
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
                style={{ padding: 14, justifyContent: 'center', alignItems: 'center' }}
              >
                <MaterialCommunityIcons name="delete" size={24} color="red" />
              </TouchableOpacity>
            )}
          </View>
        ))}

      {!editMode && !expanded && !streamingThisProduct && !showGoLiveCta && videos.length === 0 && (
        <Text style={{ opacity: 0.7, marginBottom: 8, color: darkMode ? '#c0c8cd' : '#666666' }}>
          This product has no associated videos.
        </Text>
      )}
    </View>
  );
}

function GoLiveCTA({
  youtubeEnabled,
  isGoogleLinked,
  onGoLivePress,
  onNavigateToProfile,
  darkMode,
}: {
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  onGoLivePress: () => void;
  onNavigateToProfile: () => void;
  darkMode: boolean;
}) {
  if (!isGoogleLinked) {
    return (
      <NudgeRow
        icon="google"
        text="Link your Google account to stream this product live"
        onPress={onNavigateToProfile}
        darkMode={darkMode}
      />
    );
  }
  if (!youtubeEnabled) {
    return (
      <NudgeRow
        icon="youtube"
        text="Enable YouTube Live in Integrations to stream this product"
        onPress={onNavigateToProfile}
        darkMode={darkMode}
      />
    );
  }
  return (
    <Button
      mode="outlined"
      icon="youtube"
      onPress={onGoLivePress}
      style={{ marginHorizontal: 14, marginBottom: 8 }}
    >
      Go Live
    </Button>
  );
}

function NudgeRow({
  icon,
  text,
  onPress,
  darkMode,
}: {
  icon: string;
  text: string;
  onPress: () => void;
  darkMode: boolean;
}) {
  const color = darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 14,
        marginBottom: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        opacity: 0.7,
      }}
    >
      <Icon source={icon} size={16} color={color} />
      <Text style={{ flex: 1, fontSize: 13, color }}>{text}</Text>
      <Icon source="chevron-right" size={16} color={color} />
    </Pressable>
  );
}

function VideoEmbed({ url, darkMode }: { url: string; darkMode: boolean }) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return (
      <TouchableOpacity onPress={() => void Linking.openURL(url)}>
        <Text
          style={{
            paddingHorizontal: 14,
            fontSize: 16,
            lineHeight: 26,
            color: darkMode ? '#6dd5ed' : '#0062cc',
            textDecorationLine: 'underline',
          }}
        >
          {url}
        </Text>
      </TouchableOpacity>
    );
  }
  const embedUri = `https://www.youtube-nocookie.com/embed/${videoId}`;
  if (Platform.OS === 'web') {
    return (
      <View
        style={{
          height: 200,
          marginHorizontal: 14,
          marginVertical: 8,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line react-native/no-raw-text */}
        {
          <iframe
            src={embedUri}
            title="Embedded product video"
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        }
      </View>
    );
  }
  const { WebView } = require('react-native-webview');
  return (
    <WebView
      source={{ uri: embedUri }}
      style={{ height: 200, marginHorizontal: 14, marginVertical: 8, borderRadius: 8 }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
    />
  );
}
