import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Tab = 'files' | 'map' | 'settings';

export function AppTabBar({ active, mapFile }: { active: Tab; mapFile?: string }) {
  const tabs: { id: Tab; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { id: 'files', label: 'Fichiers', icon: 'folder' },
    { id: 'map', label: 'Carte', icon: 'map' },
    { id: 'settings', label: 'Réglages', icon: 'settings' },
  ];

  const navigate = (tab: Tab) => {
    if (tab === 'files') router.replace('/library');
    if (tab === 'settings') router.replace('/settings' as never);
    if (tab === 'map' && mapFile) router.replace({ pathname: '/map', params: { file: mapFile } });
  };

  return <View style={styles.bar}>{tabs.map((tab) => {
    const disabled = tab.id === 'map' && !mapFile && active !== 'map';
    const selected = active === tab.id;
    return <Pressable key={tab.id} disabled={disabled} accessibilityRole="tab" accessibilityState={{ selected, disabled }} onPress={() => navigate(tab.id)} style={styles.tab} android_ripple={{ color: '#D5E3FF', borderless: true }}>
      <View style={[styles.iconPill, selected && styles.iconPillActive]}><MaterialIcons name={tab.icon} size={22} color={disabled ? '#BCC2CA' : selected ? '#174EA6' : '#5F6368'} /></View>
      <Text style={[styles.label, selected && styles.labelActive, disabled && styles.disabled]}>{tab.label}</Text>
    </Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', zIndex: 30, left: 12, right: 12, bottom: 10, height: 68, flexDirection: 'row', backgroundColor: 'rgba(248,249,250,0.96)', borderRadius: 22, paddingHorizontal: 4, paddingVertical: 5, elevation: 8, shadowColor: '#202124', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 16 },
  iconPill: { width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconPillActive: { backgroundColor: '#D8E6FF' },
  label: { color: '#5F6368', fontSize: 12, fontWeight: '600' },
  labelActive: { color: '#174EA6', fontWeight: '700' },
  disabled: { color: '#BCC2CA' },
});
