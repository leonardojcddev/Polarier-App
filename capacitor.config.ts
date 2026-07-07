import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.polarier.auto',
  appName: 'Polarier Auto',
  webDir: 'dist',
  server: {
    url: 'https://app.automate-polarier.tech',
    cleartext: true
  },
  plugins: {
    App: {
      urlScheme: 'polarier'
    }
  }
};

export default config;
