import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { ResizeMode, Video } from 'expo-av';
import { Product } from '@/types/Product';

interface Props {
  product: Product;
}

export default function ProductVideos({ product }: Props) {
  const width = Dimensions.get('window').width;
  const isWeb = Platform.OS === 'web';
  const videoGallery = useRef<FlatList>(null);

  // States
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoCount, setVideoCount] = useState(product.videos.length);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < videoCount - 1;

  // Refs and Callbacks
  const goToIndex = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, videoCount - 1));
      if (clamped === currentIndex) return;
      try {
        videoGallery.current?.scrollToIndex({ index: clamped, animated: true });
        setCurrentIndex(clamped);
      } catch {
        // In case FlatList hasn't measured yet, fallback to offset
        videoGallery.current?.scrollToOffset({ offset: clamped * width, animated: true });
        setCurrentIndex(clamped);
      }
    },
    [videoCount, currentIndex, width],
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems?.length && viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 75 }).current;

  // Effects
  useEffect(() => {
    setVideoCount(product.videos.length);
  }, [product.videos.length]);

  // Arrow key navigation on web
  useEffect(() => {
    if (!isWeb) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (canGoNext) goToIndex(currentIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (canGoPrev) goToIndex(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isWeb, currentIndex, videoCount, canGoPrev, canGoNext, goToIndex]);

  // Don't render if no videos
  if (product.videos.length === 0) {
    return null;
  }

  // Render
  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        Dismantling Videos
      </Text>

      <View style={styles.videoContainer}>
        <FlatList
          data={product.videos}
          ref={videoGallery}
          keyExtractor={(item, index) => `video-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={width}
          disableIntervalMomentum
          getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item, index }) => (
            <SingleVideo
              video={item}
              index={index + 1}
              maxIndex={product.videos.length}
              isActive={index === currentIndex}
            />
          )}
        />

        {/* Chevrons for navigation */}
        {videoCount > 1 && (
          <>
            <Pressable
              onPress={() => goToIndex(currentIndex - 1)}
              disabled={!canGoPrev}
              style={[styles.chevron, styles.chevronLeft, { opacity: canGoPrev ? 1 : 0.4 }]}
              hitSlop={10}
            >
              <Icon source="chevron-left" size={28} color="white" />
            </Pressable>

            <Pressable
              onPress={() => goToIndex(currentIndex + 1)}
              disabled={!canGoNext}
              style={[styles.chevron, styles.chevronRight, { opacity: canGoNext ? 1 : 0.4 }]}
              hitSlop={10}
            >
              <Icon source="chevron-right" size={28} color="white" />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

interface SingleVideoProps {
  video: { url: string; title?: string; description?: string; id: number };
  index: number;
  maxIndex: number;
  isActive: boolean;
}

function SingleVideo({ video, index, maxIndex, isActive }: SingleVideoProps) {
  const width = Dimensions.get('window').width;
  const videoRef = useRef<Video>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Pause video when it's not active (user scrolled away)
  useEffect(() => {
    if (!isActive && isPlaying) {
      videoRef.current?.pauseAsync();
      setIsPlaying(false);
    }
  }, [isActive, isPlaying]);

  const togglePlayPause = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setIsPlaying(true);
    }
  };

  const handlePlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setIsLoading(false);
      setIsPlaying(status.isPlaying);

      // Auto-pause when video ends
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    }
  };

  const handleError = (error: string) => {
    console.error('Video playback error:', error);
    setHasError(true);
    setIsLoading(false);
  };

  return (
    <View style={[styles.videoWrapper, { width }]}>
      {hasError ? (
        <View style={styles.errorContainer}>
          <Icon source="alert-circle-outline" size={48} color="#ff6b6b" />
          <Text style={styles.errorText}>Failed to load video</Text>
          <Text style={styles.errorSubtext}>{video.url}</Text>
        </View>
      ) : (
        <>
          <Video
            ref={videoRef}
            source={{ uri: video.url }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            onError={handleError}
            shouldPlay={false}
          />

          {/* Loading Indicator */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {/* Video Info Overlay */}
          <View style={styles.infoOverlay}>
            <Text style={styles.videoCounter}>{`${index} / ${maxIndex}`}</Text>
            {video.title && <Text style={styles.videoTitle}>{video.title}</Text>}
          </View>

          {/* Description (below video) */}
          {video.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.videoDescription}>{video.description}</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  title: {
    paddingHorizontal: 16,
    marginBottom: 12,
    fontWeight: 'bold',
  },
  videoContainer: {
    height: 300,
    position: 'relative',
  },
  videoWrapper: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: 250,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  errorSubtext: {
    color: '#999',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  infoOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
  },
  videoCounter: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    fontSize: 14,
    alignSelf: 'flex-start',
  },
  videoTitle: {
    padding: 8,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  descriptionContainer: {
    padding: 12,
    backgroundColor: '#f5f5f5',
  },
  videoDescription: {
    fontSize: 14,
    color: '#333',
  },
  chevron: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -20 }],
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  chevronLeft: {
    left: 10,
  },
  chevronRight: {
    right: 10,
  },
});
