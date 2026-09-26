import { Platform } from 'react-native';

export function getFloatingPosition(): 'absolute' {
  return (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute';
}
