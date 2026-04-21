import { StyleSheet } from 'react-native';

export const livePreviewStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  content: {
    alignItems: 'center',
    gap: 8,
  },
  videoFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  overlayText: {
    color: '#fff',
    textAlign: 'center',
  },
  caption: {
    color: '#999',
  },
  retryText: {
    color: '#fff',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});
