import colors from '@/lib/ui/styles/colors';
import { MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';

const fonts = configureFonts({
  config: {
    // Headers use Source Serif 4
    displayLarge: { fontFamily: 'SourceSerif4_400Regular' },
    displayMedium: { fontFamily: 'SourceSerif4_400Regular' },
    displaySmall: { fontFamily: 'SourceSerif4_400Regular' },
    headlineLarge: { fontFamily: 'SourceSerif4_400Regular' },
    headlineMedium: { fontFamily: 'SourceSerif4_400Regular' },
    headlineSmall: { fontFamily: 'SourceSerif4_400Regular' },
    titleLarge: { fontFamily: 'SourceSerif4_400Regular' },
    titleMedium: { fontFamily: 'SourceSerif4_400Regular' },
    titleSmall: { fontFamily: 'SourceSerif4_400Regular' },

    // Body text uses Inter
    bodyLarge: { fontFamily: 'Inter_400Regular' },
    bodyMedium: { fontFamily: 'Inter_400Regular' },
    bodySmall: { fontFamily: 'Inter_400Regular' },
    labelLarge: { fontFamily: 'Inter_400Regular' },
    labelMedium: { fontFamily: 'Inter_400Regular' },
    labelSmall: { fontFamily: 'Inter_400Regular' },
  },
});

const Themes = {
  light: {
    ...MD3LightTheme,
    colors: {
      ...colors.light,
    },
    fonts,
  },

  dark: {
    ...MD3DarkTheme,
    colors: {
      ...colors.dark,
    },
    fonts,
  },
};

export default Themes;
