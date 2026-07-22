import { AppTabBar } from '@/components/app-tab-bar';
import { formatFileSize, listGribDatasets } from '@/lib/storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function SettingsScreen() {
  const [storage, setStorage] = useState({ count: 0, bytes: 0, mapFile: undefined as string | undefined });
  useFocusEffect(useCallback(() => {
    void listGribDatasets().then(items => setStorage({
      count: items.length,
      bytes: items.reduce((total, item) => total + item.fileSize, 0),
      mapFile: items[0]?.fileName,
  }));
  }, []));
  return <View style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Réglages</Text>
    <View style={styles.offlineCard}><MaterialIcons name="offline-bolt" size={24} color="#1967D2" /><View style={styles.offlineCopy}><Text style={styles.offlineTitle}>Pensé pour le hors-ligne</Text><Text style={styles.offlineText}>Tes GRIB restent sur cet appareil. Aucun compte, cloud ou suivi.</Text></View></View>
    <Section title="Unités"><Row icon="speed" title="Vent" description="Vitesse affichée sur la carte" value="nœuds" /><Row icon="compress" title="Pression" description="Pression au niveau de la mer" value="hPa" /><Row icon="thermostat" title="Température" value="°C" /></Section>
    <Section title="Stockage"><Row icon="offline-pin" title="Fichiers hors ligne" description="Disponibles sans connexion" value={`${storage.count}`} /><Row icon="storage" title="Espace utilisé" value={formatFileSize(storage.bytes)} /></Section>
    <Section title="À propos"><Row icon="info" title="Version" value="1.1.0" /><Row icon="privacy-tip" title="Compte et suivi" description="Aucune inscription, aucun profilage" value="Aucun" /><Row icon="cloud-off" title="Mode hors ligne" value="Inclus" /></Section>
    <Text style={styles.hint}>Les unités et options avancées seront activées lorsqu’elles modifieront réellement le rendu.</Text>
  </ScrollView><AppTabBar active="settings" mapFile={storage.mapFile} /></View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.card}>{children}</View></View>; }
function Row({ icon, title, description, value }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; description?: string; value: string }) { return <View style={styles.row}><MaterialIcons name={icon} size={22} color="#5F6368" /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text>{description && <Text style={styles.rowDescription}>{description}</Text>}</View><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#FFFFFF' }, content: { padding: 20, paddingTop: 54, paddingBottom: 110 }, title: { fontSize: 30, fontWeight: '700', color: '#202124', marginBottom: 18 }, offlineCard: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', backgroundColor: '#E8F0FE', borderRadius: 18, padding: 16, marginBottom: 20 }, offlineCopy: { flex: 1 }, offlineTitle: { color: '#174EA6', fontSize: 15, fontWeight: '700' }, offlineText: { color: '#3C5F8A', fontSize: 12, lineHeight: 18, marginTop: 3 }, section: { marginBottom: 18 }, sectionTitle: { color: '#1967D2', fontSize: 13, fontWeight: '700', marginBottom: 7, marginLeft: 8 }, card: { backgroundColor: '#F8F9FA', borderRadius: 18, paddingVertical: 3 }, row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 13 }, rowCopy: { flex: 1 }, rowTitle: { color: '#202124', fontSize: 15, fontWeight: '500' }, rowDescription: { color: '#80868B', fontSize: 12, lineHeight: 17, marginTop: 2 }, value: { color: '#5F6368', fontSize: 13 }, hint: { color: '#5F6368', fontSize: 13, lineHeight: 19, paddingHorizontal: 8 } });
