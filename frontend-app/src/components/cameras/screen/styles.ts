import { Platform, StyleSheet } from 'react-native';

export const cameraScreenStyles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: {
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
  },
  list: {
    padding: 12,
    paddingBottom: 88,
    gap: 10,
  },
  emptyList: {
    flex: 1,
  },
  row: {
    gap: 10,
  },
  cell: {
    flex: 1,
  },
  cellPressable: {
    borderRadius: 14,
  },
  cellPressed: {
    opacity: 0.9,
  },
  cellSelected: {
    borderWidth: 3,
    borderColor: '#1976d2',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    opacity: 0.4,
  },
  emptyTitle: {
    marginTop: 16,
    opacity: 0.6,
  },
  emptyBody: {
    marginTop: 8,
    opacity: 0.5,
    textAlign: 'center',
  },
  fab: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
    right: 16,
    bottom: 16,
  },
  dialogContent: {
    gap: 12,
  },
  dialogLabel: {
    marginTop: 4,
  },
});
