// Layar Team Computer (0.10.0, bagian F).
//
// Browser di PC yang dipakai bot, tampil LIVE di aplikasi sebagai
// screenshot yang di-refresh tiap 2 detik, dan bisa diambil alih
// pengguna ("Take control").
//
// Kejujuran layar (pelajaran screenshot Sam yang HITAM/kosong):
// bila browser/display belum jalan, server mengembalikan
// available=false + alasan — layar ini menampilkan ALASAN itu +
// tombol "Buka browser", bukan kotak hitam yang pura-pura live.
//
// Toggle Team / Private mengganti sesi komputer yang ditampilkan
// (team = komputer tim, private = komputer privat bot itu).
// "Take control" mengalihkan kendali ke pengguna: ketuk layar =
// klik di browser, ketik = kirim teks ke elemen fokus. Bot dijeda
// selama pengguna mengendalikan; "Lepas kontrol" mengembalikannya.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import {
  clickComputer,
  getComputerScreen,
  getComputerStatus,
  getNovncUrl,
  openComputerBrowser,
  releaseControl,
  scrollComputer,
  takeControl,
  typeComputer,
  usingLabel,
  zoomComputer,
  type ComputerScope,
  type ComputerScreenShot,
  type ComputerStatus,
} from '../api/teamComputer';
import type { RootStackParamList } from '../navigation';
import { colors, radii, spacing, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type TeamComputerRoute = RouteProp<RootStackParamList, 'TeamComputer'>;

const POLL_MS = 2000;
/** URL awal saat browser dibuka dari layar ini (sama seperti screenshot Sam). */
const DEFAULT_URL = 'https://duckduckgo.com';

/**
 * 0.10.14 (Issue 2): noVNC mengunci viewport di vnc.html
 * (user-scalable=no, maximum-scale=1.0) sehingga Sam TIDAK BISA
 * pinch-zoom — desktop 1600x900 diperkecil ke lebar HP dan tidak bisa
 * diperbesar, teks jadi terlalu kecil. Suntikkan JS yang membuka zoom
 * (maks 5x) supaya Sam bisa mencubit layar untuk memperbesar desktop.
 * Disuntikkan setelah halaman selesai dimuat; noVNC satu halaman jadi
 * sekali cukup. Diakhiri `true` (kontrak react-native-webview).
 */
const VNC_ZOOM_INJECTED_JS = `(function () {
  var meta = document.querySelector('meta[name="viewport"]');
  var content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
  if (meta) {
    meta.setAttribute('content', content);
  } else {
    var m = document.createElement('meta');
    m.setAttribute('name', 'viewport');
    m.setAttribute('content', content);
    document.head.appendChild(m);
  }
  return true;
})();`;

export function TeamComputerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<TeamComputerRoute>();
  const [scope, setScope] = useState<ComputerScope>(route.params?.scope ?? 'team');
  const [status, setStatus] = useState<ComputerStatus | null>(null);
  const [shot, setShot] = useState<ComputerScreenShot | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [typeText, setTypeText] = useState('');
  // 0.10.13: mode tampilan — 'vnc' = browser LANGSUNG (noVNC,
  // interaktif: Sam masuk + memakai browser dari HP, Muse tetap
  // bisa take over lewat tool/CDP), 'mirror' = screenshot 2 dtk
  // (cara lama). Default 'vnc' karena itu yang Sam minta
  // ("biar gw bisa masuk").
  const [mode, setMode] = useState<'vnc' | 'mirror'>('vnc');
  const [novncUrl, setNovncUrl] = useState('');
  const [vncError, setVncError] = useState('');
  // URL bar (0.10.7): ketik alamat + Go — buka browser ke URL itu.
  const [urlText, setUrlText] = useState(DEFAULT_URL);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [s, shotData] = await Promise.all([
        getComputerStatus(scope),
        getComputerScreen(scope),
      ]);
      setStatus(s);
      setShot(shotData);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [scope]);

  // Refresh manual (0.10.8, perbaikan mirror STALE): paksa ambil
  // frame terbaru meski satu fetch sedang berjalan — guard
  // fetchingRef direset dulu. Dipakai tombol "Refresh layar".
  const doManualRefresh = useCallback(async () => {
    fetchingRef.current = false;
    await refresh();
  }, [refresh]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    // 0.10.13: hitung URL noVNC sekali saat layar dibuka (host
    // mengikuti server URL yang dipakai aplikasi).
    void getNovncUrl()
      .then(setNovncUrl)
      .catch(() => setVncError('Tidak bisa menghitung alamat browser VNC.'));
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      // 0.10.13: di mode VNC, WebView sudah LIVE — jangan buang
      // bandwidth mengambil screenshot tiap 2 dtk. Poll status saja
      // (5 dtk) supaya label "dipakai bot/pengguna" tetap segar.
      // Di mode Mirror, poll layar+status tiap 2 dtk seperti dulu.
      const timer = setInterval(
        () => {
          if (mode === 'mirror') {
            void refresh();
          } else {
            void getComputerStatus(scope).then((s) => {
              if (s) setStatus(s);
            });
          }
        },
        mode === 'mirror' ? POLL_MS : 5000,
      );
      return () => clearInterval(timer);
    }, [refresh, mode, scope]),
  );

  const userControls = status?.controlled_by === 'user';

  const doTakeControl = async () => {
    setActionBusy(true);
    setActionError('');
    const r = await takeControl(scope);
    if (!r.ok) setActionError(r.error ?? 'Gagal mengambil alih.');
    else await refresh();
    setActionBusy(false);
  };

  const doReleaseControl = async () => {
    setActionBusy(true);
    setActionError('');
    const r = await releaseControl(scope);
    if (!r.ok) setActionError(r.error ?? 'Gagal melepas kontrol.');
    else await refresh();
    setActionBusy(false);
  };

  const doOpenBrowser = async () => {
    setActionBusy(true);
    setActionError('');
    const r = await openComputerBrowser(scope, DEFAULT_URL, route.params?.characterId);
    if (!r.ok) setActionError(r.error ?? 'Gagal membuka browser.');
    else await refresh();
    setActionBusy(false);
  };

  // URL bar (0.10.7): navigasi ke alamat yang diketik. Tanpa skema
  // (mis. "google.com") dianggap https. open_browser tidak butuh
  // Take control — jalan kapan pun.
  const doGoUrl = async () => {
    let url = urlText.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setActionBusy(true);
    setActionError('');
    const r = await openComputerBrowser(scope, url, route.params?.characterId);
    if (!r.ok) setActionError(r.error ?? 'Gagal membuka URL.');
    else await refresh();
    setActionBusy(false);
  };

  // Zoom (0.10.7): Ctrl+plus/minus/0 ke jendela browser. Butuh
  // Take control (server menolak bila bot sedang memegang kendali).
  const doZoom = async (direction: 'in' | 'out' | 'reset') => {
    setActionBusy(true);
    setActionError('');
    const r = await zoomComputer(scope, direction, 'user');
    if (!r.ok) setActionError(r.error ?? 'Gagal zoom.');
    else await refresh();
    setActionBusy(false);
  };

  // Scroll (0.10.7): roda mouse di tengah layar. Butuh Take control.
  const doScroll = async (direction: 'down' | 'up') => {
    setActionBusy(true);
    setActionError('');
    const r = await scrollComputer(scope, direction, 3, 'user');
    if (!r.ok) setActionError(r.error ?? 'Gagal scroll.');
    else await refresh();
    setActionBusy(false);
  };

  const doType = async () => {
    const text = typeText.trim();
    if (!text) return;
    setActionBusy(true);
    setActionError('');
    const r = await typeComputer(scope, text);
    if (!r.ok) setActionError(r.error ?? 'Gagal mengetik.');
    else {
      setTypeText('');
      await refresh();
    }
    setActionBusy(false);
  };

  const onTapScreen = async (e: GestureResponderEvent) => {
    if (!userControls || viewSize.width <= 0 || viewSize.height <= 0) return;
    const x = Math.min(1, Math.max(0, e.nativeEvent.locationX / viewSize.width));
    const y = Math.min(1, Math.max(0, e.nativeEvent.locationY / viewSize.height));
    const r = await clickComputer(scope, x, y);
    if (!r.ok) setActionError(r.error ?? 'Klik gagal.');
    else await refresh();
  };

  const shotUri = shot?.available && shot.image_b64 ? `data:image/png;base64,${shot.image_b64}` : null;

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
        <Text style={styles.title}>Team Computer</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.scopeRow}>
        {(['team', 'private'] as ComputerScope[]).map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, scope === s && styles.chipOn]}
            onPress={() => setScope(s)}
            accessibilityLabel={`Komputer ${s === 'team' ? 'Team' : 'Private'}`}
          >
            <Text style={[styles.chipText, scope === s && styles.chipTextOn]}>
              {s === 'team' ? 'Team' : 'Private'}
            </Text>
          </Pressable>
        ))}
        <Text style={styles.usingText}>{usingLabel(status)}</Text>
      </View>

      {/* Mode tampilan (0.10.13): "Browser" = VNC interaktif — Sam
          masuk + memakai browser langsung dari HP (sentuh = klik,
          keyboard HP = ketik), Muse tetap bisa take over lewat
          tool/CDP. "Mirror" = screenshot 2 dtk (cara lama). */}
      <View style={styles.modeRow}>
        {(
          [
            ['vnc', 'Browser (VNC)'],
            ['mirror', 'Mirror'],
          ] as const
        ).map(([m, label]) => (
          <Pressable
            key={m}
            style={[styles.chip, mode === m && styles.chipOn]}
            onPress={() => setMode(m)}
            accessibilityLabel={`Mode ${label}`}
          >
            <Text style={[styles.chipText, mode === m && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
        {mode === 'vnc' ? (
          <Text style={styles.modeHint}>Sentuh = klik • keyboard HP = ketik</Text>
        ) : null}
      </View>

      {/* URL bar (0.10.7): ketik alamat apa pun + Go. */}
      <View style={styles.urlRow}>
        <TextInput
          style={styles.urlInput}
          placeholder="Ketik alamat… (mis. google.com)"
          placeholderTextColor={colors.muted}
          value={urlText}
          onChangeText={setUrlText}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!actionBusy}
          onSubmitEditing={() => void doGoUrl()}
        />
        <Pressable
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => void doGoUrl()}
          disabled={actionBusy || !urlText.trim()}
          accessibilityLabel="Buka alamat"
        >
          <Text style={styles.buttonPrimaryText}>Go</Text>
        </Pressable>
      </View>

      {mode === 'vnc' ? (
        <View style={styles.vncWrap}>
          {novncUrl ? (
            <WebView
              source={{ uri: novncUrl }}
              style={styles.vncView}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              // 0.10.14: buka pinch-zoom (noVNC menguncinya) — Sam bisa
              // mencubit layar untuk memperbesar desktop.
              injectedJavaScript={VNC_ZOOM_INJECTED_JS}
              onError={() => setVncError('Browser VNC tidak bisa dibuka — periksa WiFi / server (port 6081).')}
              onHttpError={() => setVncError('Browser VNC tidak bisa dibuka — periksa WiFi / server (port 6081).')}
              accessibilityLabel="Browser VNC — browser PC yang bisa kamu pakai langsung"
            />
          ) : (
            <Text style={styles.hint}>Memuat alamat browser…</Text>
          )}
          {vncError ? <Text style={styles.error}>{vncError}</Text> : null}
          <Text style={styles.vncHint}>
            Ini browser PC yang sama dengan yang dipakai bot — kamu memakainya langsung dari HP, dan Muse tetap bisa
            mengendalikannya lewat tool (take over) saat kamu minta. Cubit layar (pinch) untuk memperbesar/memperkecil
            tampilan. Bila layar hitam, tekan "Buka browser" di bawah.
          </Text>
          <View style={styles.controlsRow}>
            <Pressable
              style={[styles.button, styles.buttonPrimary, styles.flexBtn]}
              onPress={() => void doOpenBrowser()}
              disabled={actionBusy}
            >
              <Text style={styles.buttonPrimaryText}>Buka browser</Text>
            </Pressable>
          </View>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.hint}>Memuat layar komputer…</Text>
        ) : shotUri ? (
          <Pressable
            style={styles.screenWrap}
            onPress={onTapScreen}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setViewSize({ width, height });
            }}
            disabled={!userControls}
            accessibilityLabel={userControls ? 'Layar komputer — ketuk untuk klik' : 'Layar komputer'}
          >
            <Image
              source={{ uri: shotUri }}
              style={styles.screen}
              resizeMode="contain"
            />
            {!userControls ? (
              <Text style={styles.screenHint}>Bot sedang memakai — tekan "Take control" untuk mengambil alih.</Text>
            ) : (
              <Text style={styles.screenHint}>Kamu mengendalikan — ketuk layar untuk klik.</Text>
            )}
            {/* Umur frame (0.10.8, perbaikan mirror STALE): bila gambar
                beku di frame lama, umurnya membesar dan peringatan
                tampil — pengguna tahu mirror-nya hidup atau beku. */}
            {shot?.age_seconds !== null && shot?.age_seconds !== undefined ? (
              <Text style={shot.age_seconds > 10 ? styles.screenAgeStale : styles.screenAge}>
                Layar diperbarui {Math.floor(shot.age_seconds)} dtk lalu
                {shot.age_seconds > 10 ? ' — mungkin beku, tekan Refresh layar.' : ''}
              </Text>
            ) : null}
          </Pressable>
        ) : (
          <View style={styles.emptyScreen}>
            <Text style={styles.emptyTitle}>Layar belum tersedia</Text>
            <Text style={styles.emptyText}>
              {shot?.reason ?? status?.screen_reason ?? 'Browser belum dibuka atau screen capture belum jalan.'}
            </Text>
            {shot?.age_seconds !== null && shot?.age_seconds !== undefined ? (
              <Text style={styles.emptyText}>Screenshot terakhir: {Math.floor(shot.age_seconds)} dtk lalu.</Text>
            ) : null}
            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => void doOpenBrowser()}
              disabled={actionBusy}
            >
              <Text style={styles.buttonPrimaryText}>Buka browser</Text>
            </Pressable>
          </View>
        )}

        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

        <View style={styles.controlsRow}>
          {/* Refresh layar manual (0.10.8): paksa ambil frame terbaru. */}
          <Pressable
            style={[styles.button, styles.buttonGhost, styles.flexBtn]}
            onPress={() => void doManualRefresh()}
            disabled={actionBusy}
            accessibilityLabel="Refresh layar"
          >
            <Text style={styles.buttonGhostText}>⟳ Refresh layar</Text>
          </Pressable>
          {userControls ? (
            <>
              <Pressable
                style={[styles.button, styles.buttonGhost, styles.flexBtn]}
                onPress={() => void doReleaseControl()}
                disabled={actionBusy}
              >
                <Text style={styles.buttonGhostText}>Lepas kontrol</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[styles.button, styles.buttonPrimary, styles.flexBtn]}
              onPress={() => void doTakeControl()}
              disabled={actionBusy}
            >
              <Text style={styles.buttonPrimaryText}>Take control</Text>
            </Pressable>
          )}
          {!status?.browser_open && shotUri ? (
            <Pressable
              style={[styles.button, styles.buttonGhost, styles.flexBtn]}
              onPress={() => void doOpenBrowser()}
              disabled={actionBusy}
            >
              <Text style={styles.buttonGhostText}>Buka browser</Text>
            </Pressable>
          ) : null}
        </View>

        {userControls ? (
          <View style={styles.typeRow}>
            <TextInput
              style={styles.typeInput}
              placeholder="Ketik ke browser…"
              placeholderTextColor={colors.muted}
              value={typeText}
              onChangeText={setTypeText}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!actionBusy}
              onSubmitEditing={() => void doType()}
            />
            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => void doType()}
              disabled={actionBusy || !typeText.trim()}
            >
              <Text style={styles.buttonPrimaryText}>Ketik</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Zoom + scroll (0.10.7): butuh Take control. */}
        {userControls ? (
          <View style={styles.zoomRow}>
            <Pressable
              style={[styles.button, styles.buttonGhost, styles.flexBtn]}
              onPress={() => void doZoom('out')}
              disabled={actionBusy}
              accessibilityLabel="Zoom out"
            >
              <Text style={styles.buttonGhostText}>− Zoom</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonGhost, styles.flexBtn]}
              onPress={() => void doZoom('reset')}
              disabled={actionBusy}
              accessibilityLabel="Reset zoom"
            >
              <Text style={styles.buttonGhostText}>100%</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonGhost, styles.flexBtn]}
              onPress={() => void doZoom('in')}
              disabled={actionBusy}
              accessibilityLabel="Zoom in"
            >
              <Text style={styles.buttonGhostText}>+ Zoom</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonGhost, styles.flexBtn]}
              onPress={() => void doScroll('up')}
              disabled={actionBusy}
              accessibilityLabel="Scroll ke atas"
            >
              <Text style={styles.buttonGhostText}>↑ Scroll</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonGhost, styles.flexBtn]}
              onPress={() => void doScroll('down')}
              disabled={actionBusy}
              accessibilityLabel="Scroll ke bawah"
            >
              <Text style={styles.buttonGhostText}>↓ Scroll</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      )}
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
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  // 0.10.13: baris mode tampilan (Browser VNC / Mirror).
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  modeHint: {
    color: colors.muted,
    fontSize: 12,
    flex: 1,
  },
  // 0.10.13: wadah WebView VNC — mengisi sisa layar.
  vncWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  vncView: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  vncHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.sm,
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
  usingText: {
    flex: 1,
    color: colors.muted,
    fontSize: type.small,
    textAlign: 'right',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  hint: {
    color: colors.muted,
    fontSize: type.small,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  screenWrap: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.sm,
  },
  screen: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.black,
    borderRadius: radii.card,
  },
  screenHint: {
    color: colors.muted,
    fontSize: type.small,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  screenAge: {
    color: colors.muted,
    fontSize: type.small,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  screenAgeStale: {
    color: colors.danger,
    fontSize: type.small,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  emptyScreen: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: type.name,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.muted,
    fontSize: type.small,
    lineHeight: 18,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: type.small,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  flexBtn: {
    flex: 1,
  },
  button: {
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
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
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  typeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    color: colors.text,
    fontSize: type.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  urlRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  urlInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    color: colors.text,
    fontSize: type.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  zoomRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
