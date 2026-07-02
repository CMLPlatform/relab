import { StyleSheet } from 'react-native';
import { radius } from '@/constants';

export const styles = StyleSheet.create({
  sectionSummary: {
    opacity: 0.7,
    marginBottom: 8,
  },
  propertySection: {
    paddingVertical: 14,
  },
  propertyTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  propertyFields: {
    gap: 12,
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
