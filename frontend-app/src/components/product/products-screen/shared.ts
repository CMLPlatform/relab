import { Platform, StyleSheet } from 'react-native';

export const PAGE_SIZE = 24;

export const PRODUCTS_DATE_PRESETS = [
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
] as const;

export const productsScreenStyles = StyleSheet.create({
  errorBanner: {
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontWeight: 'bold',
  },
  errorMessage: {
    opacity: 0.8,
    fontSize: 13,
  },
  searchToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchbar: {
    flex: 1,
  },
  filterScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  paginationContainer: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  paginationSummary: {
    fontSize: 14,
    opacity: 0.7,
  },
  paginationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  paginationEllipsis: {
    paddingHorizontal: 4,
  },
  inlineButtonPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'center',
  },
  inlineButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  inlineProfilePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
  },
  inlineProfileText: {
    fontSize: 14,
    fontWeight: '700',
  },
  welcomeCard: {
    marginHorizontal: 0,
    borderRadius: 24,
  },
  welcomeCardContent: {
    gap: 12,
  },
  welcomeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  welcomeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTextBlock: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 24,
  },
  welcomeBody: {
    gap: 0,
  },
  welcomeSentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  welcomeBodyText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  welcomeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  listContainer: {
    flex: 1,
  },
  slowLoadingOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  slowLoadingCard: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  footerSummary: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerSummaryText: {
    opacity: 0.6,
  },
  loadMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreSummary: {
    opacity: 0.7,
    marginBottom: 8,
  },
  emptyStateContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyStateBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  headerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
    zIndex: 10,
    pointerEvents: 'none',
  },
  fab: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 31,
    elevation: 12,
    margin: 0,
  },
});
