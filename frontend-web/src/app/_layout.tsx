import { Inter_400Regular } from '@expo-google-fonts/inter';
import { SourceSerif4_400Regular } from '@expo-google-fonts/source-serif-4';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DarkTheme as NavDarkTheme, DefaultTheme as NavLightTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { adaptNavigationTheme, PaperProvider } from 'react-native-paper';
import Themes from '@/lib/ui/styles/themes';
import 'react-native-reanimated';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [loaded, error] = useFonts({
    SourceSerif4_400Regular,
    Inter_400Regular,
    ...MaterialCommunityIcons.font,
  });

  const paperTheme = colorScheme === 'dark' ? Themes.dark : Themes.light;

  const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: NavLightTheme,
    reactNavigationDark: NavDarkTheme,
    materialLight: Themes.light,
    materialDark: Themes.dark,
  });

  const navigationTheme = colorScheme === 'dark' ? DarkTheme : LightTheme;

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }
  return (
    <ThemeProvider value={navigationTheme}>
      <PaperProvider theme={paperTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: paperTheme.colors.surface },
            headerTitleStyle: {
              fontFamily: 'SourceSerif4_400Regular',
              fontSize: 24,
            },
            headerTintColor: paperTheme.colors.onSurface,
            headerTitleAlign: 'center',
            headerShadowVisible: false,
          }}
        ></Stack>
      </PaperProvider>
    </ThemeProvider>
  );
}
