import { StyleSheet } from 'react-native';

// Residue after the NativeWind convergence: everything with an exact class
// (layout, spacing, radius, border) moved to className at the call site.
export const styles = StyleSheet.create({
  // fontSize-only (no matching lineHeight) — text-lg carries lineHeight 28
  // the original never had, so it stays inline.
  propertyTitle: {
    fontSize: 18,
  },
  // fontSize-only (no matching lineHeight) — text-base carries lineHeight 24
  // the original never had, so it stays inline.
  input: {
    fontSize: 16,
  },
  // textAlignVertical has no Tailwind/NativeWind class — RN-only prop.
  multilineInput: {
    textAlignVertical: 'top',
  },
});
