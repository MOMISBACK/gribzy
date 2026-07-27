import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'files' | 'map' | 'settings';

export function AppTabBar({ active, mapFile }: { active: Tab; mapFile?: string }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const tabs: { id: Tab; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
    { id: 'files', label: t('nav.files'), icon: 'folder' },
    { id: 'map', label: t('nav.map'), icon: 'map' },
    { id: 'settings', label: t('nav.settings'), icon: 'settings' },
  ];

  const navigate = (tab: Tab) => {
    if (tab === 'files') router.replace('/library');
    if (tab === 'settings') router.replace('/settings' as never);
    if (tab === 'map' && mapFile) router.replace({ pathname: '/map', params: { file: mapFile } });
  };

  return <View style={[styles.bar, { bottom: Math.max(10, insets.bottom + 6) }]}>{tabs.map((tab) => {
    const disabled = tab.id === 'map' && !mapFile && active !== 'map';
    const selected = active === tab.id;
    return <TabItem key={tab.id} icon={tab.icon} label={tab.label} selected={selected} disabled={disabled} onPress={() => navigate(tab.id)} />;
  })}</View>;
}

function TabItem({ icon, label, selected, disabled, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [progress, selected]);

  return <Pressable disabled={disabled} accessibilityRole="tab" accessibilityState={{ selected, disabled }} onPress={onPress} style={styles.tab} android_ripple={{ color: '#D5E3FF', borderless: true }}>
    <Animated.View style={[styles.iconPill, selected && styles.iconPillActive, {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
    }]}><MaterialIcons name={icon} size={22} color={disabled ? '#BCC2CA' : selected ? '#174EA6' : '#5F6368'} /></Animated.View>
    <Text style={[styles.label, selected && styles.labelActive, disabled && styles.disabled]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', zIndex: 30, left: 14, right: 14, height: 60, flexDirection: 'row', backgroundColor: 'rgba(250,251,252,0.94)', borderRadius: 22, paddingHorizontal: 5, paddingVertical: 4, elevation: 6, shadowColor: '#202124', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 5 } },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 17 },
  iconPill: { width: 56, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconPillActive: { backgroundColor: '#DCE9FF' },
  label: { color: '#65717D', fontSize: 10, fontWeight: '600' },
  labelActive: { color: '#174EA6', fontWeight: '800' },
  disabled: { color: '#BCC2CA' },
});
