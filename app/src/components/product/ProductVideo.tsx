import { type RefObject, useCallback, useId, useState } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import DetailSectionHeader from '@/components/base/DetailSectionHeader';
import { useDialog } from '@/components/base/dialogContext';
import { FormFieldError } from '@/components/base/FormField';
import { Icon } from '@/components/base/Icon';
import { IconButton } from '@/components/base/IconButton';
import { TextInput } from '@/components/base/TextInput';
import { StreamingContent } from '@/components/cameras/StreamingContent';
import { useProductVideo } from '@/features/products/useProductVideo';
import { useAppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { describedBy } from '@/utils/a11y';
import { isHttpUrl } from '@/utils/urlSafety';
import { VideoEmbed } from './ProductVideoEmbed';

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
  onGoLivePress: () => void;
  goLiveTriggerRef?: RefObject<View | null>;
}

export default function ProductVideo({
  product,
  editMode,
  onVideoChange,
  onGoLivePress,
  goLiveTriggerRef,
}: Props) {
  const {
    rpiEnabled,
    youtubeEnabled,
    isGoogleLinked,
    activeStream,
    streamingThisProduct,
    streamingOtherProduct,
    ownedByMe,
    goToProfile,
    goToActiveStreamProduct,
  } = useProductVideo(product);
  // product comes from a live form watch, so edits round-trip through onVideoChange.
  const videos = product.videos ?? [];
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  const dialog = useDialog();
  const theme = useAppTheme();
  const linkColor = theme.tokens.text.link;
  const textColor = theme.colors.onBackground;

  const handleVideoChange = (
    idx: number,
    field: 'url' | 'title' | 'description',
    value: string,
  ) => {
    onVideoChange?.(videos.map((v, i) => (i === idx ? { ...v, [field]: value } : v)));
  };

  const handleRemove = (idx: number) => {
    onVideoChange?.(videos.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    dialog.input({
      title: 'Add video',
      placeholder: 'Video URL',
      helperText: 'Paste a video URL (YouTube)',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'Add',
          disabled: (value) => !(value?.trim() && isHttpUrl(value)),
          onPress: (url) => {
            if (!(url && isHttpUrl(url))) return;
            onVideoChange?.([...videos, { url: url.trim(), title: '', description: '' }]);
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
        buttons: [{ text: 'OK' }, { text: 'Go to stream', onPress: goToActiveStreamProduct }],
      });
      return;
    }
    onGoLivePress();
  };

  const showGoLiveCta = ownedByMe && rpiEnabled && !streamingThisProduct;
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
            onToggleExpanded={toggleExpanded}
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
          onNavigateToProfile={goToProfile}
          triggerRef={goLiveTriggerRef}
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

      {showEmptyState ? <EmptyVideoState /> : null}
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
      <TouchableOpacity onPress={onAdd} className="mt-1">
        <AppText style={{ color: linkColor }}>Add video</AppText>
      </TouchableOpacity>
    );
  }

  if (!showExpandToggle) {
    return null;
  }

  return (
    <Pressable onPress={onToggleExpanded} className="mt-1">
      <AppText style={{ color: linkColor }}>{isExpanded ? 'Hide' : `Show (${videoCount})`}</AppText>
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
      // Namespace persisted ids and positional fallbacks so a saved `{id: 0}`
      // can't collide with a new unsaved row at index 0.
      key={video.id == null ? `new-${idx}` : `id-${video.id}`}
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
  const handleTitleChange = useCallback(
    (value: string) => onVideoChange(idx, 'title', value),
    [onVideoChange, idx],
  );
  const handleUrlChange = useCallback(
    (value: string) => onVideoChange(idx, 'url', value),
    [onVideoChange, idx],
  );
  const handleDescriptionChange = useCallback(
    (value: string) => onVideoChange(idx, 'description', value),
    [onVideoChange, idx],
  );
  const handleRemove = useCallback(() => onRemove(idx), [onRemove, idx]);

  const titleErrorId = useId();
  const urlErrorId = useId();
  const titleError = video.title.trim() === '' ? 'Title is required' : undefined;
  const urlError =
    video.url.trim() === ''
      ? 'Video URL is required'
      : !isHttpUrl(video.url)
        ? 'Video URL must use http or https'
        : undefined;
  const deleteLabel = video.title.trim() ? `Remove video "${video.title}"` : 'Remove video';

  return (
    <View className="mb-4 flex-row items-center">
      <View className="flex-1">
        <TextInput
          className="px-3.5"
          style={[styles.titleInput, { color: textColor }]}
          placeholder="Title"
          value={video.title}
          onChangeText={handleTitleChange}
          editable={editMode}
          errorOnEmpty
          {...describedBy(titleErrorId, Boolean(titleError))}
        />
        <FormFieldError errorId={titleErrorId} message={titleError} />
        {editMode ? (
          <>
            <TextInput
              className="px-3.5"
              style={[styles.bodyInput, { color: textColor }]}
              placeholder="Video URL"
              value={video.url}
              onChangeText={handleUrlChange}
              errorOnEmpty
              customValidation={isHttpUrl}
              editable={editMode}
              {...describedBy(urlErrorId, Boolean(urlError))}
            />
            <FormFieldError errorId={urlErrorId} message={urlError} />
          </>
        ) : (
          <VideoEmbed url={video.url} linkColor={linkColor} />
        )}
        {editMode || video.description ? (
          <TextInput
            className="px-3.5"
            style={[styles.descriptionInput, { color: textColor }]}
            placeholder="Add description (optional)"
            value={video.description}
            onChangeText={handleDescriptionChange}
            editable={editMode}
          />
        ) : null}
      </View>
      {editMode ? (
        <IconButton
          testID={`delete-video-${idx}`}
          icon="trash-2"
          accessibilityLabel={deleteLabel}
          onPress={handleRemove}
          style={styles.deleteButton}
        />
      ) : null}
    </View>
  );
}

function GoLiveCTA({
  youtubeEnabled,
  isGoogleLinked,
  onGoLivePress,
  onNavigateToProfile,
  triggerRef,
}: {
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  onGoLivePress: () => void;
  onNavigateToProfile: () => void;
  triggerRef?: RefObject<View | null>;
}) {
  const dialog = useDialog();
  const theme = useAppTheme();
  const ready = isGoogleLinked && youtubeEnabled;

  const handlePress = useCallback(() => {
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
  }, [ready, isGoogleLinked, dialog, onNavigateToProfile, onGoLivePress]);

  return (
    <View ref={triggerRef} collapsable={false}>
      <AppButton
        variant="outline"
        onPress={handlePress}
        className={`mx-3.5 mb-2 ${ready ? '' : 'opacity-50'}`}
      >
        <Icon name="youtube" size={18} color={theme.colors.onSurface} />
        <AppText style={{ color: theme.colors.onSurface }}>Go Live</AppText>
      </AppButton>
    </View>
  );
}

function EmptyVideoState() {
  return (
    <AppText className="mb-2 text-muted-foreground">This product has no associated videos.</AppText>
  );
}

// fontSize/lineHeight combos below don't match any text-* class (e.g.
// bodyInput's 16/26 vs. text-base's 16/24) — stay style-driven. deleteButton
// stays on IconButton's `style` prop: IconButton spreads `...rest` (which
// would carry a caller className) before its own fixed className, so a
// caller className would be silently clobbered.
const styles = StyleSheet.create({
  titleInput: {
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  bodyInput: {
    fontSize: 16,
    lineHeight: 26,
  },
  descriptionInput: {
    fontSize: 16,
    lineHeight: 16,
  },
  deleteButton: {
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
