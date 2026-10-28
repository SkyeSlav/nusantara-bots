// Layar MCP (0.9.6, permintaan Sam: "pilihan Connect ke bermacam2
// mcp g ada").
//
// Sebelumnya daftar MCP hanya ada di Pengaturan (0.9.5) — sekarang
// jadi layar sendiri yang mudah ditemukan: baris "MCP ›" di Home,
// baris "MCP ›" di Pengaturan, dan menu ••• di chat tidak punya MCP
// (MCP bukan milik satu bot). Layar ini memuat:
// - Daftar server MCP dari GET /api/mcp/servers, lengkap dengan
//   toggle nyala/mati per server (POST /api/mcp/servers/:id).
//   Daftar lokal baru berubah SETELAH server mengonfirmasi.
// - Form "Connect MCP" untuk MENAMBAH server baru (nama + tipe
//   stdio/http/sse + URL/perintah) — POST /api/mcp/servers.
//   Sampai server menyediakan endpoint tambah-server, submit
//   menampilkan pesan itu apa adanya (tidak ada sukses palsu).
// - State jujur: loading / ready / unsupported (endpoint belum ada)
//   / error (dengan tombol muat ulang).

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  addMcpServer,
  getMcpServers,
  mcpServerSummary,
  setMcpServerEnabled,
  testMcpServer,
  validateMcpServerInput,
  type McpServer,
  type McpServerProbe,
  type McpServerType,
} from '../api/mcp';
import { ApiError } from '../api/types';
import type { RootStackParamList } from '../navigation';
import { colors, radii, spacing, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TYPE_OPTIONS: Array<{ value: McpServerType; label: string }> = [
  { value: 'http', label: 'HTTP' },
  { value: 'sse', label: 'SSE' },
  { value: 'stdio', label: 'stdio' },
];

export function McpScreen() {
  const navigation = useNavigation<Nav>();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unsupported' | 'error'>(
    'loading',
  );
  const [toggling, setToggling] = useState<string | null>(null);
  // Probe per server (0.10.0): hasil terakhir POST /api/mcp/servers/:id/test
  // (handshake + tools/list). `testing` = id server yang sedang di-probe.
  const [testing, setTesting] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, McpServerProbe>>({});
  // Form Connect MCP.
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<McpServerType>('http');
  const [formUrl, setFormUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const list = await getMcpServers();
      setServers(list ?? []);
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setState('unsupported');
      } else {
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Toggle satu server MCP. Daftar lokal baru berubah SETELAH server
  // mengonfirmasi — bila gagal, tampilkan error dan biarkan toggle
  // apa adanya.
  const toggleMcp = async (server: McpServer) => {
    setToggling(server.id);
    try {
      const ok = await setMcpServerEnabled(server.id, !server.enabled);
      if (!ok) {
        Alert.alert('MCP', 'Server meminta access token — simpan token dulu.');
        return;
      }
      setServers((prev) =>
        prev.map((s) => (s.id === server.id ? { ...s, enabled: !s.enabled } : s)),
      );
    } catch (e) {
      Alert.alert(
        'MCP',
        e instanceof Error ? e.message : 'Gagal mengubah server MCP.',
        [{ text: 'OK' }],
      );
    } finally {
      setToggling(null);
    }
  };

  const submitConnect = async () => {
    const input = { name: formName, type: formType, url: formUrl };
    const invalid = validateMcpServerInput(input);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setFormBusy(true);
    setFormError('');
    try {
      const created = await addMcpServer(input);
      if (!created) {
        setFormError('Server meminta access token — simpan token dulu.');
        setFormBusy(false);
        return;
      }
      setFormName('');
      setFormUrl('');
      setFormOpen(false);
      await load();
      Alert.alert('MCP', `Server "${created.name}" terhubung.`, [{ text: 'OK' }]);
    } catch (e) {
      // Termasuk 404/501: endpoint tambah-server belum ada di server.
      setFormError(
        e instanceof Error ? e.message : 'Gagal menambah server MCP.',
      );
    } finally {
      setFormBusy(false);
    }
  };

  // Probe satu server MCP (0.10.0): handshake + tools/list. Hasil
  // disimpan per server dan ditampilkan di bawah barisnya — sukses =
  // jumlah tool + beberapa nama tool; gagal = pesan error apa adanya
  // (bukan "OK" palsu). 404 = endpoint test belum ada di server.
  const testServer = async (server: McpServer) => {
    setTesting(server.id);
    try {
      const probe = await testMcpServer(server.id);
      setProbes((prev) => ({ ...prev, [server.id]: probe }));
    } catch (e) {
      const message =
        e instanceof ApiError && e.status === 404
          ? 'Endpoint test belum ada di server (minta server di-update).'
          : e instanceof Error
            ? e.message
            : 'Probe gagal.';
      setProbes((prev) => ({ ...prev, [server.id]: { ok: false, tools: [], total: 0, error: message } }));
    } finally {
      setTesting(null);
    }
  };

  const renderServer = ({ item }: { item: McpServer }) => {
    const probe = probes[item.id];
    return (
      <View style={styles.optionRow}>
        <View style={styles.optionTextWrap}>
          <Text style={styles.optionText}>{item.name}</Text>
          <Text style={styles.optionSub}>
            {item.type}
            {item.url ? ` · ${item.url}` : ''}
            {typeof item.tools_count === 'number' ? ` · ${item.tools_count} tools` : ''}
            {` · ${item.enabled ? 'Aktif' : 'Nonaktif'}`}
          </Text>
          {probe ? (
            <Text style={[styles.probeText, probe.ok ? styles.probeOk : styles.probeFail]}>
              {probe.ok
                ? `✓ ${probe.total} tools: ${probe.tools
                    .slice(0, 3)
                    .map((t) => t.name)
                    .join(', ')}${probe.total > 3 ? '…' : ''}`
                : `✗ ${probe.error ?? 'Probe gagal.'}`}
            </Text>
          ) : null}
        </View>
        <Pressable
          style={styles.testButton}
          onPress={() => void testServer(item)}
          disabled={testing === item.id}
          accessibilityLabel={`Test server ${item.name}`}
        >
          <Text style={styles.testButtonText}>{testing === item.id ? '…' : 'Test'}</Text>
        </Pressable>
        <Switch
          value={item.enabled}
          disabled={toggling === item.id}
          onValueChange={() => void toggleMcp(item)}
          trackColor={{ false: colors.surface3, true: colors.accent }}
          thumbColor={colors.white}
        />
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Kembali"
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>MCP</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>Connect MCP</Text>
        <Text style={styles.hint}>
          Hubungkan server MCP baru — mis. Zapier, GitHub, atau server MCP lain.
        </Text>
        {formOpen ? (
          <>
            <Text style={styles.label}>Nama</Text>
            <TextInput
              style={styles.input}
              placeholder="cth. zapier"
              placeholderTextColor={colors.muted}
              value={formName}
              onChangeText={setFormName}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>Tipe</Text>
            <View style={styles.chips}>
              {TYPE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, formType === opt.value && styles.chipOn]}
                  onPress={() => setFormType(opt.value)}
                >
                  <Text style={[styles.chipText, formType === opt.value && styles.chipTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>
              {formType === 'stdio' ? 'Perintah server' : 'URL endpoint'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={
                formType === 'stdio'
                  ? 'cth. npx -y @modelcontextprotocol/server-filesystem /data'
                  : 'https://mcp.contoh.com/api/v1/connect'
              }
              placeholderTextColor={colors.muted}
              value={formUrl}
              onChangeText={setFormUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.button, styles.buttonPrimary, formBusy && styles.buttonBusy]}
              onPress={() => void submitConnect()}
              disabled={formBusy}
            >
              <Text style={styles.buttonPrimaryText}>Connect MCP</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonGhost]} onPress={() => setFormOpen(false)}>
              <Text style={styles.buttonGhostText}>Batal</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.button, styles.buttonPrimary]}
            onPress={() => setFormOpen(true)}
          >
            <Text style={styles.buttonPrimaryText}>+ Connect MCP</Text>
          </Pressable>
        )}

        <Text style={styles.section}>Server MCP</Text>
        {state === 'loading' ? (
          <Text style={styles.hint}>Memuat daftar MCP…</Text>
        ) : state === 'unsupported' ? (
          <Text style={styles.hint}>
            Server belum menyediakan daftar MCP (endpoint /api/mcp/servers belum ada). Minta
            server di-update untuk mengaktifkan bagian ini.
          </Text>
        ) : state === 'error' ? (
          <>
            <Text style={styles.hint}>Daftar MCP tidak bisa dimuat.</Text>
            <Pressable style={[styles.button, styles.buttonGhost]} onPress={() => void load()}>
              <Text style={styles.buttonGhostText}>Muat ulang</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              {servers.length === 0
                ? 'Tidak ada server MCP yang terdaftar di server.'
                : `${mcpServerSummary(servers).enabled} aktif dari ${
                    mcpServerSummary(servers).total
                  } server.`}
            </Text>
            <FlatList
              data={servers}
              keyExtractor={(item) => item.id}
              renderItem={renderServer}
              scrollEnabled={false}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '300',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
    marginLeft: spacing.sm,
  },
  spacer: {
    width: 44,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  section: {
    color: colors.text,
    fontSize: type.name,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.muted,
    fontSize: type.small,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: type.preview,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    color: colors.text,
    fontSize: type.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  chipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontSize: type.preview,
    fontWeight: '600',
  },
  chipTextOn: {
    color: colors.black,
  },
  error: {
    color: colors.danger,
    fontSize: type.small,
    marginTop: spacing.md,
  },
  button: {
    marginTop: spacing.md,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonPrimaryText: {
    color: colors.black,
    fontSize: type.body,
    fontWeight: '700',
  },
  buttonGhost: {
    backgroundColor: colors.surface,
  },
  buttonGhostText: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  buttonBusy: {
    opacity: 0.6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionText: {
    color: colors.text,
    fontSize: type.body,
    fontWeight: '600',
  },
  optionSub: {
    color: colors.muted,
    fontSize: type.small,
    marginTop: 2,
  },
  probeText: {
    fontSize: type.small,
    marginTop: 4,
  },
  probeOk: {
    color: colors.accent,
  },
  probeFail: {
    color: colors.danger,
  },
  testButton: {
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  testButtonText: {
    color: colors.text,
    fontSize: type.small,
    fontWeight: '700',
  },
});
