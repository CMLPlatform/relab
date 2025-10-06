/**
 * ExternalLinkButton - Button that opens external URLs with web link behavior
 *
 * Web: Wraps Button in <a> tag for right-click context menu, Ctrl+click, etc.
 *      The Button's onPress is defined explicitly as it would otherwise block
 *      the default browser behavior.
 * Mobile: Uses React Native Linking.openURL()
 */
import { Linking, Platform } from 'react-native';
import { Button } from 'react-native-paper';
interface ExternalLinkButtonProps {
  href: string;
  children: React.ReactNode;
  mode?: Parameters<typeof Button>[0]['mode'];
  icon?: string;
  contentStyle?: Parameters<typeof Button>[0]['contentStyle'];
  style?: Parameters<typeof Button>[0]['style'];
}

export function ExternalLinkButton({
  href,
  children,
  mode = 'outlined',
  icon,
  contentStyle,
  style,
  ...props
}: ExternalLinkButtonProps) {
  if (Platform.OS === 'web') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', display: 'inline-block' }}
      >
        <Button
          mode={mode}
          icon={icon}
          contentStyle={contentStyle}
          style={style}
          onPress={() => Linking.openURL(href)}
          {...props}
        >
          {children}
        </Button>
      </a>
    );
  }

  return (
    <Button
      mode={mode}
      onPress={() => Linking.openURL(href)}
      icon={icon}
      contentStyle={contentStyle}
      style={style}
      accessibilityRole="link"
      {...props}
    >
      {children}
    </Button>
  );
}
