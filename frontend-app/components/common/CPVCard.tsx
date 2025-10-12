import { Card, Icon, Text, useTheme } from 'react-native-paper';
import { View } from 'react-native';
import cpvJSON from '@/assets/data/cpv.json';

const CPVData = cpvJSON as Record<string, string>;

interface Props {
  CPVId: string;
  onPress?: () => void;
}

export default function CPVCard({ CPVId, onPress }: Props) {
  // Hooks
  const theme = useTheme();

  // Variables
  let name = CPVData[CPVId] || 'Unknown CPV Code';
  if (name.length > 100) {
    name = name.substring(0, 97) + '...';
  }

  // Render
  return (
    <Card style={{ backgroundColor: theme.colors.primaryContainer, overflow: 'hidden' }} onPress={onPress}>
      <Card.Content>
        <Text variant="bodyMedium" style={{ height: 40 }}>
          {name}
        </Text>
        <Text variant="labelSmall" style={{ opacity: 0.7, height: 20, textAlign: 'right' }}>
          {CPVId}
        </Text>
        <View
          style={{
            position: 'absolute',
            right: 10,
            top: -30,
            transform: [{ rotate: '-15deg' }],
            opacity: 0.1,
          }}
        >
          <Icon source="shape" size={150} />
        </View>
      </Card.Content>
    </Card>
  );
}
