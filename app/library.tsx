import { AppTabBar } from '@/components/app-tab-bar';
import { formatGribTechnicalDetails, type GribCompatibilityReport } from '@/lib/gribParser';
import { localizeTechnicalMessage, useI18n } from '@/lib/i18n';
import type { GribDataset } from '@/lib/gribTypes';
import { deleteGribDataset, formatDate, formatFileSize, importGribFile, listGribDatasets, renameGribDataset } from '@/lib/storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LibraryScreen() {
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const [datasets, setDatasets] = useState<GribDataset[]>([]);
  const [editing, setEditing] = useState<GribDataset | null>(null);
  const [draftName, setDraftName] = useState('');
  const [importing, setImporting] = useState(false);
  const [compatibility, setCompatibility] = useState<{
    report: GribCompatibilityReport;
    dataset?: GribDataset;
  } | null>(null);
  const [technicalDetailsOpen, setTechnicalDetailsOpen] = useState(false);
  const [detailsCopied, setDetailsCopied] = useState(false);
  const refresh = useCallback(() => { void listGribDatasets().then(setDatasets); }, []);
  useFocusEffect(refresh);

  const openFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      setImporting(true);
      const imported = await importGribFile(result.assets[0].uri, result.assets[0].name);
      refresh();
      if (imported.status === 'supported' && imported.dataset) {
        router.push({ pathname: '/map', params: { file: imported.dataset.fileName } });
      } else {
        setTechnicalDetailsOpen(false);
        setDetailsCopied(false);
        setCompatibility({ report: imported.report, dataset: imported.dataset });
      }
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

  const closeCompatibility = () => setCompatibility(null);
  const openCompatibleLayers = () => {
    const dataset = compatibility?.dataset;
    setCompatibility(null);
    if (dataset) router.push({ pathname: '/map', params: { file: dataset.fileName } });
  };
  const copyTechnicalDetails = async () => {
    if (!compatibility) return;
    await Clipboard.setStringAsync(formatGribTechnicalDetails(compatibility.report));
    setDetailsCopied(true);
  };

  return <View style={styles.screen}>
    <View style={[styles.brandBanner, { marginTop: insets.top + 8 }]}>
      <Image source={require('../assets/images/gribzy-bear-source.png')} resizeMode="contain" style={styles.brandMark} accessibilityLabel="Gribzy" />
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
      <View style={styles.hero}><Text style={styles.heroTitle}>{t('library.heroTitle')}</Text><Text style={styles.heroText}>{t('library.heroText')}</Text></View>
      <Pressable style={styles.primary} onPress={openFile} disabled={importing} android_ripple={{ color: '#669DF6' }}>
        {importing ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="folder-open" size={24} color="#FFFFFF" />}
        <Text style={styles.primaryText}>{importing ? t('library.opening') : t('library.open')}</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => router.push('/select')}><MaterialIcons name="download" size={21} color="#1967D2" /><Text style={styles.secondaryText}>{t('library.download')}</Text></Pressable>
      <Text style={styles.sectionTitle}>{t('library.recent')}</Text>
      {datasets.length === 0 ? <View style={styles.empty}><MaterialIcons name="insert-drive-file" size={32} color="#9AA0A6" /><Text style={styles.emptyTitle}>{t('library.emptyTitle')}</Text><Text style={styles.emptyText}>{t('library.emptyText')}</Text></View> : <View style={styles.recentList}>{datasets.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => router.push({ pathname: '/map', params: { file: item.fileName } })} android_ripple={{ color: '#E8F0FE' }}>
        <View style={styles.fileIcon}><MaterialIcons name="insert-drive-file" size={20} color="#1967D2" /></View>
        <View style={styles.fileCopy}><Text style={styles.fileName} numberOfLines={1}>{item.zone.label}</Text><Text style={styles.fileMeta}>{item.model} · {item.runHour === '--' ? t('library.unknownSource') : `${item.runDate} · ${item.runHour} UTC`} · {formatFileSize(item.fileSize, language)}</Text><Text style={styles.fileDate}>{t('library.downloaded', { date: formatDate(item.downloadedAt, language) })}</Text></View>
        <Pressable hitSlop={8} style={styles.more} onPress={() => menu(item)}><MaterialIcons name="more-vert" size={23} color="#68727D" /></Pressable>
      </Pressable>)}</View>}
    </ScrollView>
    <AppTabBar active="files" mapFile={datasets[0]?.fileName} />
    <Modal visible={!!compatibility} transparent animationType="fade" onRequestClose={closeCompatibility}>
      <View style={styles.overlay}>
        <View style={styles.compatibilityDialog}>
          <ScrollView contentContainerStyle={styles.compatibilityContent}>
            <View style={[styles.compatibilityIcon, compatibility?.dataset ? styles.warningIcon : styles.errorIcon]}>
              <MaterialIcons name={compatibility?.dataset ? 'warning-amber' : 'block'} size={25} color={compatibility?.dataset ? '#8A5700' : '#B3261E'} />
            </View>
            <Text style={styles.dialogTitle}>
              {compatibility?.dataset ? t('import.partialTitle') : t('import.unsupportedTitle')}
            </Text>
            <Text style={styles.compatibilityIntro}>
              {compatibility?.dataset ? t('import.partialText') : t('import.unsupportedText')}
            </Text>
            {!!compatibility?.report.availableLayers.length && <>
              <Text style={styles.compatibilityHeading}>{t('import.available')}</Text>
              {compatibility.report.availableLayers.map(layer => (
                <Text key={layer} style={styles.compatibilityLine}>✓ {layer === 'pressure' ? t('import.pressure') : t('import.wind')}</Text>
              ))}
            </>}
            {!!compatibility?.report.issues.length && <>
              <Text style={styles.compatibilityHeading}>{t('import.unavailable')}</Text>
              {compatibility.report.issues.slice(0, 4).map((issue, index) => (
                <Text key={`${issue.messageIndex}-${issue.category}-${index}`} style={styles.issueLine}>
                  • {issue.variable ? `${issue.variable}: ` : ''}{issue.message}
                </Text>
              ))}
              {compatibility.report.issues.length > 4 &&
                <Text style={styles.moreIssues}>{t('import.moreIssues', { count: compatibility.report.issues.length - 4 })}</Text>}
            </>}
            <Pressable
              style={styles.detailsToggle}
              onPress={() => setTechnicalDetailsOpen(open => !open)}
              accessibilityState={{ expanded: technicalDetailsOpen }}>
              <Text style={styles.detailsToggleText}>{t('import.technicalDetails')}</Text>
              <MaterialIcons name={technicalDetailsOpen ? 'expand-less' : 'expand-more'} size={22} color="#405366" />
            </Pressable>
            {technicalDetailsOpen && <View style={styles.technicalPanel}>
              <Text selectable style={styles.technicalText}>{formatGribTechnicalDetails(compatibility!.report)}</Text>
            </View>}
            <Pressable style={styles.copyButton} onPress={copyTechnicalDetails}>
              <MaterialIcons name={detailsCopied ? 'check' : 'content-copy'} size={19} color="#1967D2" />
              <Text style={styles.copyButtonText}>{detailsCopied ? t('import.copied') : t('import.copyDetails')}</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.compatibilityActions}>
            <Pressable style={styles.textButton} onPress={closeCompatibility}><Text>{t('common.close')}</Text></Pressable>
            {compatibility?.dataset && <Pressable style={styles.save} onPress={openCompatibleLayers}><Text style={styles.saveText}>{t('import.openAvailable')}</Text></Pressable>}
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}><View style={styles.dialog}><Text style={styles.dialogTitle}>{t('library.renameTitle')}</Text><TextInput autoFocus value={draftName} onChangeText={setDraftName} maxLength={80} style={styles.input} /><View style={styles.dialogActions}><Pressable style={styles.textButton} onPress={() => setEditing(null)}><Text>{t('common.cancel')}</Text></Pressable><Pressable style={styles.save} onPress={rename}><Text style={styles.saveText}>{t('common.save')}</Text></Pressable></View></View></KeyboardAvoidingView></Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, brandBanner: { height: 72, marginHorizontal: 20, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E6FA' }, brandMark: { width: 66, height: 66 }, content: { paddingHorizontal: 20 }, hero: { paddingTop: 20, paddingBottom: 22 }, heroTitle: { color: '#202124', fontSize: 30, lineHeight: 36, fontWeight: '700' }, heroText: { color: '#5F6368', fontSize: 15, lineHeight: 22, marginTop: 5 },
  primary: { minHeight: 60, borderRadius: 18, backgroundColor: '#1967D2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, overflow: 'hidden', elevation: 2 }, primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' }, secondary: { alignSelf: 'center', minHeight: 48, borderRadius: 16, marginTop: 8, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#1967D2', fontSize: 15, fontWeight: '700' }, sectionTitle: { color: '#202124', fontSize: 19, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  recentList: { gap: 8 }, row: { minHeight: 88, borderRadius: 19, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, overflow: 'hidden', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#EDF0F4' }, fileIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' }, fileCopy: { flex: 1, paddingHorizontal: 12 }, fileName: { color: '#172B3E', fontSize: 16, fontWeight: '700' }, fileMeta: { color: '#556574', fontSize: 11, lineHeight: 16, marginTop: 4 }, fileDate: { color: '#87919C', fontSize: 11, marginTop: 2 }, more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  empty: { alignItems: 'center', padding: 28, borderRadius: 16, backgroundColor: '#F8F9FA' }, emptyTitle: { color: '#202124', fontSize: 17, fontWeight: '700', marginTop: 10 }, emptyText: { color: '#5F6368', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 }, overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(32,33,36,0.32)' }, dialog: { borderRadius: 28, backgroundColor: '#FFFFFF', padding: 24 }, dialogTitle: { fontSize: 21, fontWeight: '700', color: '#202124' }, input: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: '#9AA0A6', paddingHorizontal: 16, fontSize: 16, marginTop: 20 }, dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 }, textButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 }, save: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 16, backgroundColor: '#1967D2' }, saveText: { color: '#FFFFFF', fontWeight: '700' },
  compatibilityDialog: { maxHeight: '86%', borderRadius: 28, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  compatibilityContent: { padding: 24, paddingBottom: 12 },
  compatibilityIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  warningIcon: { backgroundColor: '#FFF3D6' }, errorIcon: { backgroundColor: '#F9DEDC' },
  compatibilityIntro: { color: '#5F6368', fontSize: 14, lineHeight: 21, marginTop: 8 },
  compatibilityHeading: { color: '#25384A', fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 },
  compatibilityLine: { color: '#29455F', fontSize: 14, lineHeight: 22 },
  issueLine: { color: '#5F6368', fontSize: 13, lineHeight: 20 },
  moreIssues: { color: '#7A838D', fontSize: 12, marginTop: 5 },
  detailsToggle: { minHeight: 48, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E8ECF1' },
  detailsToggleText: { color: '#25384A', fontSize: 14, fontWeight: '700' },
  technicalPanel: { borderRadius: 14, backgroundColor: '#F4F6F8', padding: 12, maxHeight: 190 },
  technicalText: { color: '#3C4A57', fontSize: 10, lineHeight: 15, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyButton: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 },
  copyButtonText: { color: '#1967D2', fontSize: 14, fontWeight: '700' },
  compatibilityActions: { minHeight: 72, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#EEF1F4', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 },
});
