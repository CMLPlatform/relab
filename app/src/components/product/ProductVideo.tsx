import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from 'react-native-paper';
import { TextInput } from '@/components/base/TextInput';
import DetailSectionHeader from '@/components/common/DetailSectionHeader';
import { useDialog } from '@/components/common/dialogContext';
import { StreamingContent } from '@/components/common/StreamingContent';
import type { StreamSession } from '@/context/streamSession';
import { extractYouTubeVideoId, isValidHttpUrl } from '@/services/api/validation/productSchema';
import { openExternalUrl } from '@/services/externalLinks';
import { useAppTheme } from '@/theme';
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
  const theme = useAppTheme();
  const linkColor = theme.tokens.text.link;
  const textColor = theme.colors.onBackground;

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
          disabled: (value) => !(value?.trim() && isValidHttpUrl(value)),
          onPress: (url) => {
            if (!(url && isValidHttpUrl(url))) return;
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
  const hasVideos = videos.length > 0;
  const showExpandToggle = !editMode && hasVideos;
  const showVideoRows = editMode || streamingThisProduct || expanded;
  const showEmptyState = !(
    editMode ||
    expanded ||
    streamingThisProduct ||
    showGoLiveCta ||
    hasVideos
  );

  return (
    <View>
      <DetailSectionHeader
        title="Video"
        tooltipTitle="Add uploaded recordings or start a live stream."
        rightElement={
          <VideoHeaderAction
            editMode={editMode}
            showExpandToggle={showExpandToggle}
            isExpanded={expanded}
            videoCount={videos.length}
            linkColor={linkColor}
            onAdd={handleAdd}
            onToggleExpanded={() => setExpanded((value) => !value)}
          />
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
        />
      ) : null}

      {showVideoRows ? (
        <VideoList
          videos={videos}
          editMode={editMode}
          textColor={textColor}
          linkColor={linkColor}
          onVideoChange={handleVideoChange}
          onRemove={handleRemove}
        />
      ) : null}

      {showEmptyState ? <EmptyVideoState mutedColor={theme.tokens.text.muted} /> : null}
    </View>
  );
}

function VideoHeaderAction({
  editMode,
  showExpandToggle,
  isExpanded,
  videoCount,
  linkColor,
  onAdd,
  onToggleExpanded,
}: {
  editMode: boolean;
  showExpandToggle: boolean;
  isExpanded: boolean;
  videoCount: number;
  linkColor: string;
  onAdd: () => void;
  onToggleExpanded: () => void;
}) {
  if (editMode) {
    return (
      <TouchableOpacity onPress={onAdd} style={styles.headerAction}>
        <Text style={{ color: linkColor }}>Add video</Text>
      </TouchableOpacity>
    );
  }

  if (!showExpandToggle) {
    return null;
  }

  return (
    <Pressable onPress={onToggleExpanded} style={styles.headerAction}>
      <Text style={{ color: linkColor }}>{isExpanded ? 'Hide' : `Show (${videoCount})`}</Text>
    </Pressable>
  );
}

function VideoList({
  videos,
  editMode,
  textColor,
  linkColor,
  onVideoChange,
  onRemove,
}: {
  videos: Video[];
  editMode: boolean;
  textColor: string;
  linkColor: string;
  onVideoChange: (idx: number, field: 'url' | 'title' | 'description', value: string) => void;
  onRemove: (idx: number) => void;
}) {
  return videos.map((video, idx) => (
    <VideoRow
      key={video.id ?? idx}
      video={video}
      idx={idx}
      editMode={editMode}
      textColor={textColor}
      linkColor={linkColor}
      onVideoChange={onVideoChange}
      onRemove={onRemove}
    />
  ));
}

function VideoRow({
  video,
  idx,
  editMode,
  textColor,
  linkColor,
  onVideoChange,
  onRemove,
}: {
  video: Video;
  idx: number;
  editMode: boolean;
  textColor: string;
  linkColor: string;
  onVideoChange: (idx: number, field: 'url' | 'title' | 'description', value: string) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <View style={styles.videoRow}>
      <View style={styles.videoFields}>
        <TextInput
          style={[styles.titleInput, { color: textColor }]}
          placeholder="Title"
          value={video.title}
          onChangeText={(value) => onVideoChange(idx, 'title', value)}
          editable={editMode}
          errorOnEmpty
        />
        {editMode ? (
          <TextInput
            style={[styles.bodyInput, { color: textColor }]}
            placeholder="Video URL"
            value={video.url}
            onChangeText={(value) => onVideoChange(idx, 'url', value)}
            errorOnEmpty
            customValidation={isValidHttpUrl}
            editable={editMode}
          />
        ) : (
          <VideoEmbed url={video.url} linkColor={linkColor} />
        )}
        {(editMode || Boolean(video.description)) && (
          <TextInput
            style={[styles.descriptionInput, { color: textColor }]}
            placeholder="Add description (optional)"
            value={video.description}
            onChangeText={(value) => onVideoChange(idx, 'description', value)}
            editable={editMode}
          />
        )}
      </View>
      {editMode ? (
        <TouchableOpacity
          testID={`delete-video-${idx}`}
          onPress={() => onRemove(idx)}
          style={styles.deleteButton}
        >
          <MaterialCommunityIcons name="delete" size={24} color="red" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function GoLiveCTA({
  youtubeEnabled,
  isGoogleLinked,
  onGoLivePress,
  onNavigateToProfile,
}: {
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  onGoLivePress: () => void;
  onNavigateToProfile: () => void;
}) {
  const dialog = useDialog();
  const ready = isGoogleLinked && youtubeEnabled;

  const handlePress = () => {
    if (!ready) {
      const message = !isGoogleLinked
        ? 'Link your Google account in your profile to enable live streaming.'
        : 'Enable YouTube Live in your profile integrations to start streaming.';
      dialog.alert({
        title: 'Set up YouTube Live',
        message,
        buttons: [{ text: 'Cancel' }, { text: 'Go to profile', onPress: onNavigateToProfile }],
      });
      return;
    }
    onGoLivePress();
  };

  return (
    <Button
      mode="outlined"
      icon="youtube"
      onPress={handlePress}
      style={[styles.goLiveButton, { opacity: ready ? 1 : 0.5 }]}
    >
      Go Live
    </Button>
  );
}

const embedContainerStyle = {
  maxWidth: 480,
  aspectRatio: 16 / 9,
  width: '100%' as const,
  alignSelf: 'center' as const,
  marginHorizontal: 14,
  marginVertical: 8,
  borderRadius: 8,
  overflow: 'hidden' as const,
};

function VideoEmbed({ url, linkColor }: { url: string; linkColor: string }) {
  const videoId = extractYouTubeVideoId(url);
  const handleOpenUrl = async () => openExternalUrl(url);
  if (!videoId) {
    return (
      <TouchableOpacity onPress={handleOpenUrl}>
        <Text style={[styles.videoLink, { color: linkColor }]}>{url}</Text>
      </TouchableOpacity>
    );
  }
  const embedUri = `https://www.youtube-nocookie.com/embed/${videoId}`;
  if (Platform.OS === 'web') {
    return (
      <View style={embedContainerStyle}>
        <iframe
          src={embedUri}
          title="Embedded product video"
          style={styles.webEmbed}
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </View>
    );
  }
  const { WebView } = require('react-native-webview');
  return (
    <WebView
      originWhitelist={['https://www.youtube-nocookie.com']}
      source={{ uri: embedUri }}
      style={embedContainerStyle}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
    />
  );
}

function EmptyVideoState({ mutedColor }: { mutedColor: string }) {
  return (
    <Text style={[styles.emptyState, { color: mutedColor }]}>
      This product has no associated videos.
    </Text>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    marginTop: 4,
  },
  videoRow: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  videoFields: {
    flex: 1,
  },
  titleInput: {
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  bodyInput: {
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 26,
  },
  descriptionInput: {
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 16,
  },
  deleteButton: {
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goLiveButton: {
    marginHorizontal: 14,
    marginBottom: 8,
  },
  videoLink: {
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 26,
    textDecorationLine: 'underline',
  },
  webEmbed: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
    borderRadius: 8,
  },
  emptyState: {
    opacity: 0.7,
    marginBottom: 8,
  },
});
