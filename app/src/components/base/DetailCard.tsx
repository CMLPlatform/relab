import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Card } from './Card';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function DetailCard({ children, style }: Props) {
  return (
    <Card className="mx-3.5 px-3 pt-1.5 pb-1.5" style={style}>
      {children}
    </Card>
  );
}
