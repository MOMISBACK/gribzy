import { Stack } from 'expo-router';
import { I18nProvider } from '@/lib/i18n';

export default function RootLayout() {
  return (
    <I18nProvider><Stack screenOptions={{ headerShown: false }} /></I18nProvider>
  );
}
