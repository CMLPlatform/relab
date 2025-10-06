import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: 'relab-frontend-web',
    slug: 'relab-frontend-web',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/favicon.png',
    scheme: 'relab-frontend-web',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/favicon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.cml.relabFrontendWeb',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './src/assets/images/favicon.ico',
    },
    plugins: [
      'expo-router',
      'expo-font',
      [
        'expo-splash-screen',
        {
          image: './assets/images/favicon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
        },
      ],
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
  };
};
