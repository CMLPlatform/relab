import { StyleSheet } from 'react-native';
import { radius, spacing } from '@/constants/layout';

export const styles = StyleSheet.create({
  sectionSummary: {
    opacity: 0.7,
    marginBottom: 8,
  },
  chipContainer: {
    paddingVertical: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  divider: {
    height: 1,
  },
  propertySection: {
    paddingVertical: 14,
  },
  propertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  propertyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  propertyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    padding: spacing.sm,
    borderRadius: 20,
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  propertyFields: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 12,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
