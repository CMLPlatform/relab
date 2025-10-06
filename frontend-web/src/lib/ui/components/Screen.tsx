import { ScrollView, ScrollViewProps } from 'react-native';

interface ScreenProps extends ScrollViewProps {
  children: React.ReactNode;
  maxWidth?: number;
  padding?: number;
  gap?: number;
}

export const Screen = ({
  children,
  maxWidth = 1000,
  padding = 16,
  gap = 16,
  style,
  contentContainerStyle,
  ...props
}: ScreenProps) => {
  return (
    <ScrollView
      style={[{ flex: 1 }, style]}
      contentContainerStyle={[
        {
          padding,
          gap,
          maxWidth,
          alignSelf: 'center',
        },
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {children}
    </ScrollView>
  );
};
