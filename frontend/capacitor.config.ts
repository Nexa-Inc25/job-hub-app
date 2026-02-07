import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.fieldledger.app',
  appName: 'FieldLedger',
  webDir: 'build',
  
  // Server configuration - use production API
  server: {
    // In production, the app loads from the bundled web assets
    // API calls go to the production backend
    androidScheme: 'https',
    iosScheme: 'https',
  },
  
  // iOS-specific configuration
  ios: {
    contentInset: 'automatic',
    scheme: 'FieldLedger',
    // Allow inline media playback
    allowsLinkPreview: true,
  },
  
  // Plugin configuration
  plugins: {
    // Splash screen - shown during app load
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      showSpinner: true,
      spinnerColor: '#00e676',
      splashFullScreen: true,
      splashImmersive: true,
    },
    
    // Status bar styling
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e',
    },
    
    // Camera permissions
    Camera: {
      // Save photos to gallery by default
      saveToGallery: true,
    },
    
    // Geolocation settings
    Geolocation: {
      // High accuracy for job site GPS tagging
      enableHighAccuracy: true,
    },
  },
};

export default config;

