import { Href, Link } from 'expo-router';
import { Text, useTheme } from 'react-native-paper';

export const InlineLink = ({
  href,
  children,
  variant,
  ...linkprops
}: {
  href: Href;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Text>['variant'];
}) => {
  const theme = useTheme();

  return (
    <Link href={href} {...linkprops}>
      <Text
        variant={variant}
        style={{
          color: theme.colors.primary,
          textDecorationLine: 'underline',
        }}
      >
        {children}
      </Text>
    </Link>
  );
};
