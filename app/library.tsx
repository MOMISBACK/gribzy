import { AppTabBar } from '@/components/app-tab-bar';
import { localizeTechnicalMessage, useI18n } from '@/lib/i18n';
import type { GribDataset } from '@/lib/gribTypes';
import { deleteGribDataset, formatDate, formatFileSize, importGribFile, listGribDatasets, renameGribDataset } from '@/lib/storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function LibraryScreen() {
  const { language, t } = useI18n();
  const [datasets, setDatasets] = useState<GribDataset[]>([]);
  const [editing, setEditing] = useState<GribDataset | null>(null);
  const [draftName, setDraftName] = useState('');
  const [importing, setImporting] = useState(false);
  const refresh = useCallback(() => { void listGribDatasets().then(setDatasets); }, []);
  useFocusEffect(refresh);

  const openFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      setImporting(true);
      const dataset = await importGribFile(result.assets[0].uri, result.assets[0].name);
      refresh();
      router.push({ pathname: '/map', params: { file: dataset.fileName } });
    } catch (error) {
      Alert.alert(t('error.incompatibleTitle'), error instanceof Error ? localizeTechnicalMessage(error.message, language) : t('error.open'));
    } finally { setImporting(false); }
  };

  const menu = (item: GribDataset) => Alert.alert(item.zone.label, undefined, [
    { text: t('library.rename'), onPress: () => { setEditing(item); setDraftName(item.zone.label); } },
    { text: t('library.delete'), style: 'destructive', onPress: () => Alert.alert(t('library.deleteTitle'), item.zone.label, [{ text: t('common.cancel'), style: 'cancel' }, { text: t('library.delete'), style: 'destructive', onPress: () => { deleteGribDataset(item); refresh(); } }]) },
    { text: t('common.cancel'), style: 'cancel' },
  ]);

  const rename = () => {
    if (!editing) return;
    try { renameGribDataset(editing, draftName); setEditing(null); refresh(); }
    catch (error) { Alert.alert(t('error.invalidName'), error instanceof Error ? localizeTechnicalMessage(error.message, language) : t('error.rename')); }
  };

  return <View style={styles.screen}>
    <View style={styles.appBar}><View style={styles.logo}><MaterialIcons name="air" size={25} color="#FFFFFF" /></View><View><Text style={styles.brand}>Gribzy</Text><Text style={styles.tagline}>{t('library.tagline')}</Text></View></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><Text style={styles.heroTitle}>{t('library.heroTitle')}</Text><Text style={styles.heroText}>{t('library.heroText')}</Text></View>
      <Pressable style={styles.primary} onPress={openFile} disabled={importing} android_ripple={{ color: '#669DF6' }}>
        {importing ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="folder-open" size={24} color="#FFFFFF" />}
        <Text style={styles.primaryText}>{importing ? t('library.opening') : t('library.open')}</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => router.push('/select')}><MaterialIcons name="download" size={21} color="#1967D2" /><Text style={styles.secondaryText}>{t('library.download')}</Text></Pressable>
      <Text style={styles.sectionTitle}>{t('library.recent')}</Text>
      {datasets.length === 0 ? <View style={styles.empty}><MaterialIcons name="insert-drive-file" size={32} color="#9AA0A6" /><Text style={styles.emptyTitle}>{t('library.emptyTitle')}</Text><Text style={styles.emptyText}>{t('library.emptyText')}</Text></View> : datasets.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => router.push({ pathname: '/map', params: { file: item.fileName } })} android_ripple={{ color: '#E8F0FE' }}>
        <View style={styles.fileIcon}><MaterialIcons name="insert-drive-file" size={18} color="#1967D2" /></View>
        <View style={styles.fileCopy}><Text style={styles.fileName} numberOfLines={1}>{item.zone.label}</Text><Text style={styles.fileMeta}>{item.model} · {formatFileSize(item.fileSize, language)} · {item.runHour === '--' ? t('library.unknownSource') : `run ${item.runDate} ${item.runHour} UTC`}</Text><Text style={styles.fileDate}>{t('library.downloaded', { date: formatDate(item.downloadedAt, language) })}</Text></View>
        <Pressable hitSlop={8} style={styles.more} onPress={() => menu(item)}><MaterialIcons name="more-vert" size={24} color="#5F6368" /></Pressable>
      </Pressable>)}
    </ScrollView>
    <AppTabBar active="files" mapFile={datasets[0]?.fileName} />
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}><View style={styles.dialog}><Text style={styles.dialogTitle}>{t('library.renameTitle')}</Text><TextInput autoFocus value={draftName} onChangeText={setDraftName} maxLength={80} style={styles.input} /><View style={styles.dialogActions}><Pressable style={styles.textButton} onPress={() => setEditing(null)}><Text>{t('common.cancel')}</Text></Pressable><Pressable style={styles.save} onPress={rename}><Text style={styles.saveText}>{t('common.save')}</Text></Pressable></View></View></KeyboardAvoidingView></Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, appBar: { paddingTop: 48, paddingHorizontal: 20, height: 100, flexDirection: 'row', alignItems: 'center', gap: 12 }, logo: { width: 40, height: 40, borderRadius: 16, backgroundColor: '#1967D2', alignItems: 'center', justifyContent: 'center' }, brand: { color: '#202124', fontSize: 24, fontWeight: '700' }, tagline: { color: '#5F6368', fontSize: 12, marginTop: 1 }, content: { paddingHorizontal: 20, paddingBottom: 110 }, hero: { paddingTop: 10, paddingBottom: 22 }, heroTitle: { color: '#202124', fontSize: 30, lineHeight: 36, fontWeight: '700' }, heroText: { color: '#5F6368', fontSize: 15, lineHeight: 22, marginTop: 5 },
  primary: { minHeight: 60, borderRadius: 18, backgroundColor: '#1967D2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, overflow: 'hidden', elevation: 2 }, primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' }, secondary: { alignSelf: 'center', minHeight: 48, borderRadius: 16, marginTop: 8, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#1967D2', fontSize: 15, fontWeight: '700' }, sectionTitle: { color: '#202124', fontSize: 19, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  row: { minHeight: 78, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, overflow: 'hidden' }, fileIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' }, fileCopy: { flex: 1, paddingHorizontal: 12 }, fileName: { color: '#202124', fontSize: 16, fontWeight: '600' }, fileMeta: { color: '#5F6368', fontSize: 12, marginTop: 3 }, fileDate: { color: '#80868B', fontSize: 11, marginTop: 2 }, more: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  empty: { alignItems: 'center', padding: 28, borderRadius: 16, backgroundColor: '#F8F9FA' }, emptyTitle: { color: '#202124', fontSize: 17, fontWeight: '700', marginTop: 10 }, emptyText: { color: '#5F6368', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 }, overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(32,33,36,0.32)' }, dialog: { borderRadius: 28, backgroundColor: '#FFFFFF', padding: 24 }, dialogTitle: { fontSize: 21, fontWeight: '700', color: '#202124' }, input: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: '#9AA0A6', paddingHorizontal: 16, fontSize: 16, marginTop: 20 }, dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 }, textButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 }, save: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: '#1967D2' }, saveText: { color: '#FFFFFF', fontWeight: '700' },
});
