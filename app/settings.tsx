import { AppTabBar } from '@/components/app-tab-bar';
import { formatFileSize, listGribDatasets } from '@/lib/storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n, type LanguagePreference } from '@/lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { language, preference, setPreference, t } = useI18n();
  const insets = useSafeAreaInsets();
  const [storage, setStorage] = useState({ count: 0, bytes: 0, mapFile: undefined as string | undefined });
  useFocusEffect(useCallback(() => {
    void listGribDatasets().then(items => setStorage({
      count: items.length,
      bytes: items.reduce((total, item) => total + item.fileSize, 0),
      mapFile: items[0]?.fileName,
  }));
  }, []));
  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
    <Text style={styles.title}>{t('settings.title')}</Text>
    <View style={styles.offlineCard}><MaterialIcons name="offline-bolt" size={24} color="#1967D2" /><View style={styles.offlineCopy}><Text style={styles.offlineTitle}>{t('settings.offlineTitle')}</Text><Text style={styles.offlineText}>{t('settings.offlineText')}</Text></View></View>
    <Section title={t('settings.language')}><View style={styles.languageCard}>{(['auto', 'en', 'fr'] as LanguagePreference[]).map((option) => {
      const selected = preference === option;
      const label = option === 'auto' ? t('settings.automatic') : option === 'en' ? t('settings.english') : t('settings.french');
      return <Pressable key={option} onPress={() => setPreference(option)} accessibilityRole="radio" accessibilityState={{ checked: selected }} style={[styles.languageOption, selected && styles.languageOptionSelected]}><Text style={[styles.languageLabel, selected && styles.languageLabelSelected]}>{label}</Text>{selected && <MaterialIcons name="check" size={20} color="#1967D2" />}</Pressable>;
    })}<Text style={styles.languageHint}>{t('settings.automaticDetail', { language: language === 'fr' ? t('settings.french') : t('settings.english') })}</Text></View></Section>
    <Section title={t('settings.units')}><Row icon="speed" title={t('map.wind')} description={t('settings.windDescription')} value={t('map.knots')} /><Row icon="compress" title={t('map.pressure')} description={t('settings.pressureDescription')} value="hPa" /><Row icon="thermostat" title={t('settings.temperature')} value="°C" /></Section>
    <Section title={t('settings.storage')}><Row icon="offline-pin" title={t('settings.offlineFiles')} description={t('settings.availableOffline')} value={`${storage.count}`} /><Row icon="storage" title={t('settings.usedSpace')} value={formatFileSize(storage.bytes, language)} /></Section>
    <Section title={t('settings.about')}><Row icon="info" title={t('settings.version')} value="1.1.0" /><Row icon="privacy-tip" title={t('settings.account')} description={t('settings.accountDescription')} value={t('settings.none')} /><Row icon="cloud-off" title={t('settings.offlineMode')} value={t('settings.included')} /></Section>
    <Text style={styles.hint}>{t('settings.hint')}</Text>
  </ScrollView><AppTabBar active="settings" mapFile={storage.mapFile} /></View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>; }
function Row({ icon, title, description, value }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; description?: string; value: string }) { return <View style={styles.row}><MaterialIcons name={icon} size={22} color="#5F6368" /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text>{description && <Text style={styles.rowDescription}>{description}</Text>}</View><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#FFFFFF' }, content: { padding: 20, paddingTop: 54 }, title: { fontSize: 30, fontWeight: '700', color: '#202124', marginBottom: 18 }, offlineCard: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', backgroundColor: '#E8F0FE', borderRadius: 18, padding: 16, marginBottom: 20 }, offlineCopy: { flex: 1 }, offlineTitle: { color: '#174EA6', fontSize: 15, fontWeight: '700' }, offlineText: { color: '#3C5F8A', fontSize: 12, lineHeight: 18, marginTop: 3 }, section: { marginBottom: 18 }, sectionTitle: { color: '#1967D2', fontSize: 13, fontWeight: '700', marginBottom: 7, marginLeft: 8 }, card: { backgroundColor: '#F8F9FA', borderRadius: 18, paddingVertical: 3 }, languageCard: { backgroundColor: '#F8F9FA', borderRadius: 18, padding: 6 }, languageOption: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, languageOptionSelected: { backgroundColor: '#E8F0FE' }, languageLabel: { color: '#3C4043', fontSize: 15, fontWeight: '500' }, languageLabelSelected: { color: '#174EA6', fontWeight: '700' }, languageHint: { color: '#80868B', fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingVertical: 7 }, row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 13 }, rowCopy: { flex: 1 }, rowTitle: { color: '#202124', fontSize: 15, fontWeight: '500' }, rowDescription: { color: '#80868B', fontSize: 12, lineHeight: 17, marginTop: 2 }, value: { color: '#5F6368', fontSize: 13 }, hint: { color: '#5F6368', fontSize: 13, lineHeight: 19, paddingHorizontal: 8 } });
