import { MaterialCommunityIcons } from '@expo/vector-icons';
import { JSX } from 'react';
import { IconButton, Tooltip, useTheme } from 'react-native-paper';

export const InfoTooltip = ({ title }: { title: string }): JSX.Element => {
  const theme = useTheme();
  return (
    <Tooltip title={title}>
      <IconButton
        icon={() => (
          <MaterialCommunityIcons name="information-outline" size={20} color={theme.colors.onSurfaceVariant} />
        )}
        size={20}
        style={{ margin: 0 }}
      />
    </Tooltip>
  );
};
