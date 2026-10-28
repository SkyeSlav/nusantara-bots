/**
 * Layar Deck / Kantor — kantor isometrik 3D tempat bot-bot bekerja.
 *
 * Atas: tombol kembali + judul "Kantor" + label fase siang/malam +
 * toggle animasi (hemat baterai). Tengah: scene 3D (OfficeScene).
 * Bawah: legenda — tiap bot dengan titik warna blob-nya, nama, dan
 * status NYATA dari presence server ("bekerja" / "diam"). Bot tanpa
 * kursi (lebih dari 5 bot) tetap tampil di legenda sebagai "di luar
 * kantor" — tidak ada aktivitas yang dikarang.
 *
 * Nameplate + speech bubble (0.9.8): dirender sebagai overlay View
 * di atas Canvas (posisi dari proyeksi kamera di OfficeScene) —
 * nama bot melayang di atas blob-nya, bubble berisi catatan tugas
 * dari beacon presence (atau "bekerja…" bila bekerja tanpa catatan).
 *
 * Presence di-poll tiap 10 detik; palet siang–malam dihitung ulang
 * tiap 60 detik dari jam perangkat. Bila server tak terjangkau,
 * semua bot tampil diam + pil offline (sama seperti Home).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { checkCap, getCharacters } from '../api/client';
import { getPresence, workingMap, type BeaconEntry } from '../api/presence';
import { updateBeresTasks, type BeresEntry } from '../api/deckOverlay';
import { dayPaletteAt, dayPhase, type DayPalette } from '../api/dayphase';
import { ghostColor } from '../api/blob';
import type { DeckOverlayItem } from '../api/deckOverlay';
import type { Character } from '../api/types';
import type { RootStackParamList } from '../navigation';
import { OfficeScene } from '../components/deck/OfficeScene';
import { colors, radii, spacing, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PHASE_LABEL: Record<string, string> = {
  day: 'Siang',
  sunset: 'Senja',
  night: 'Malam',
};

const SEATS = 5;

export function DeckScreen() {
  const navigation = useNavigation<Nav>();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  // Catatan tugas per bot (dari beacon presence) — isi speech bubble.
  const [notes, setNotes] = useState<Record<string, string>>({});
  // Beacon presence mentah per bot — sumber status tag (§18.3).
  const [beacons, setBeacons] = useState<Record<string, BeaconEntry>>({});
  // Tugas terakhir yang dikenal per bot (note terakhir non-kosong —
  // diingat client, karena beacon bisa mengosongkan note saat bot
  // diam; dipakai "Beres:" §18.7).
  const [lastNotes, setLastNotes] = useState<Record<string, string>>({});
  // Tugas yang baru selesai per bot — bubble "Beres: <tugas>" (§18.7).
  const [beres, setBeres] = useState<Record<string, BeresEntry>>({});
  // Cermin ref untuk load() (useCallback kosong): working + tugas
  // terakhir SEBELUM poll ini, supaya transisi kerja→diam terlihat.
  const workingRef = useRef<Record<string, boolean>>({});
  const lastNotesRef = useRef<Record<string, string>>({});
  // Cap harian per bot (false = BUDGET HABIS). Hanya diisi bila
  // /api/costs/cap-check menjawab; gagal = tidak ada data (jangan klaim).
  const [capAllowed, setCapAllowed] = useState<Record<string, boolean>>({});
  // Posisi layar nameplate + bubble (dari OfficeScene, proyeksi kamera).
  const [overlays, setOverlays] = useState<DeckOverlayItem[]>([]);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [animated, setAnimated] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const chars = await getCharacters().catch(() => null);
      if (chars) setCharacters(chars);
      const pres = await getPresence().catch(() => null);
      if (pres) {
        const newWorking = workingMap(pres);
        setWorking(newWorking);
        // Catatan tugas per bot (klaim bot tentang dirinya sendiri).
        const n: Record<string, string> = {};
        for (const [id, entry] of Object.entries(pres.characters)) {
          if (entry.note && entry.note.trim()) n[id] = entry.note;
        }
        setNotes(n);
        // Ingat tugas terakhir (§18.7): note bisa kosong saat bot
        // diam, tapi tugas terakhirnya tetap dikenal client.
        const mergedNotes = { ...lastNotesRef.current, ...n };
        lastNotesRef.current = mergedNotes;
        setLastNotes(mergedNotes);
        // "Beres:" dari transisi kerja→diam (client-side — server
        // tidak menyediakan field tugas-selesai).
        setBeres((prev) =>
          updateBeresTasks(prev, workingRef.current, newWorking, mergedNotes, Date.now()),
        );
        workingRef.current = newWorking;
        setBeacons(pres.characters ?? {});
        setReachable(true);
        // Gate cap per bot (fail-soft per bot: yang gagal dicek tidak
        // masuk peta — status tag tidak boleh klaim BUDGET HABIS
        // tanpa jawaban eksplisit allowed === false dari server).
        const ids = Object.keys(pres.characters ?? {});
        if (ids.length > 0) {
          const results = await Promise.allSettled(ids.map((id) => checkCap(id)));
          const caps: Record<string, boolean> = {};
          results.forEach((r, i) => {
            if (r.status === 'fulfilled') caps[ids[i]] = r.value.allowed;
          });
          setCapAllowed(caps);
        }
      } else {
        setWorking({});
        setBeacons({});
        setCapAllowed({});
        // Server tak terjangkau: jangan buat "Beres" baru dari data
        // lama — hanya buang entri yang sudah lewat 5 menit.
        setBeres((prev) =>
          updateBeresTasks(prev, {}, {}, lastNotesRef.current, Date.now()),
        );
        workingRef.current = {};
        setReachable(false);
      }
    } catch {
      setWorking({});
      setBeacons({});
      setCapAllowed({});
      setBeres((prev) =>
        updateBeresTasks(prev, {}, {}, lastNotesRef.current, Date.now()),
      );
      workingRef.current = {};
      setReachable(false);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 10_000);
    const clock = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  const palette: DayPalette = useMemo(() => dayPaletteAt(now), [now]);
  const phase = useMemo(() => dayPhase(now), [now]);
  const workingCount = useMemo(
    () => characters.filter((c) => working[c.id]).length,
    [characters, working],
  );

  const seatedIds = useMemo(() => {
    const sorted = [...characters].sort((a, b) => {
      const wa = working[a.id] ? 0 : 1;
      const wb = working[b.id] ? 0 : 1;
      if (wa !== wb) return wa - wb;
      return a.name.localeCompare(b.name);
    });
    return new Set(sorted.slice(0, SEATS).map((c) => c.id));
  }, [characters, working]);

  const renderLegend = ({ item }: { item: Character }) => {
    const isWorking = !!working[item.id];
    const seated = seatedIds.has(item.id);
    return (
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: ghostColor(item.id) }]} />
        <Text style={styles.legendName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.legendStatus, isWorking && styles.legendWorking]}>
          {isWorking ? '● bekerja' : '○ diam'}
        </Text>
        {!seated ? <Text style={styles.legendNote}>di luar kantor</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Kembali">
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Kantor</Text>
          <Text style={styles.subtitle}>
            {PHASE_LABEL[phase]} · {workingCount} dari {characters.length} bot bekerja
          </Text>
        </View>
        <Pressable
          style={[styles.animToggle, !animated && styles.animToggleOff]}
          onPress={() => setAnimated((v) => !v)}
          accessibilityLabel={animated ? 'Matikan animasi' : 'Nyalakan animasi'}
        >
          <Text style={styles.animToggleText}>{animated ? '▶ Animasi' : '⏸ Diam'}</Text>
        </Pressable>
      </View>

      {reachable === false ? (
        <View style={styles.offlinePill}>
          <Text style={styles.offlineText}>Lokal — server tidak terjangkau, bot tampil diam</Text>
        </View>
      ) : null}

      <View style={styles.scene}>
        <OfficeScene
          characters={characters}
          working={working}
          animated={animated}
          palette={palette}
          notes={notes}
          beacons={beacons}
          capAllowed={capAllowed}
          beresTasks={beres}
          onOverlays={setOverlays}
        />
        {/* Overlay nameplate + speech bubble di atas Canvas (0.9.8).
            Posisi dari proyeksi kamera (fraksi layar); pointerEvents
            none supaya sentuhan tetap ke Canvas.
            0.9.10: nameplate DIPOSISIKAN JUGA SECARA HORIZONTAL dari
            item.x (dulu diabaikan — semua nameplate menumpuk di tengah
            layar). Tiap kolom digeser -50% supaya tepat di atas
            karakternya. */}
        <View style={styles.overlay} pointerEvents="none">
          {overlays.map((item) => (
            <View
              key={item.botId}
              style={[
                styles.overlayItem,
                { bottom: `${(1 - item.y) * 100}%`, left: `${item.x * 100}%` },
              ]}
            >
              {item.bubble ? (
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText} numberOfLines={2}>
                    {item.bubble}
                  </Text>
                  <View style={styles.bubbleTail} />
                </View>
              ) : null}
              <View style={styles.nameplate}>
                <View
                  style={[
                    styles.nameplateDot,
                    { backgroundColor: item.working ? '#22c55e' : '#64748b' },
                  ]}
                />
                <Text style={styles.nameplateText} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            </View>
          ))}
        </View>
        {/* Status tag LIVE di bawah tiap karakter (§18.3): panel gelap
            + teks amber + badge LIVE. Badge LIVE hanya bila datanya
            live (ada beacon) — OFFLINE tampil tanpa badge, jangan
            pura-pura live. Beda dari badge tugas §17.3 (di atas:
            nama + tugas): tag ini = STATE bot. */}
        <View style={styles.overlay} pointerEvents="none">
          {overlays
            .filter((item) => item.statusTag)
            .map((item) => (
              <View
                key={`tag-${item.botId}`}
                style={[
                  styles.statusTag,
                  { top: `${item.statusTag!.y * 100}%`, left: `${item.statusTag!.x * 100}%` },
                ]}
              >
                {item.statusTag!.live ? (
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                ) : (
                  <View style={styles.offlineDot} />
                )}
                <Text style={styles.statusTagText}>{item.statusTag!.label}</Text>
              </View>
            ))}
        </View>
        {/* Kantor kosong (0 bot): pil penjelas di tengah scene. */}
        {characters.length === 0 ? (
          <View style={styles.emptyScene} pointerEvents="none">
            <Text style={styles.emptySceneText}>Kantor kosong — buat bot dulu dari Home</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Yang di kantor</Text>
        <FlatList
          data={characters}
          keyExtractor={(item) => item.id}
          renderItem={renderLegend}
          ListEmptyComponent={<Text style={styles.empty}>Belum ada bot — buat dulu dari Home.</Text>}
        />
      </View>
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
    gap: spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: colors.text,
    fontSize: 26,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: type.small,
  },
  animToggle: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  animToggleOff: {
    backgroundColor: colors.surface2,
  },
  animToggleText: {
    color: colors.text,
    fontSize: type.small,
    fontWeight: '600',
  },
  offlinePill: {
    alignSelf: 'flex-start',
    marginLeft: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  offlineText: {
    color: colors.muted,
    fontSize: type.small,
  },
  scene: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Pil penjelas saat kantor kosong (0 bot) — di tengah scene.
  emptyScene: {
    position: 'absolute',
    top: '45%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emptySceneText: {
    color: colors.muted,
    fontSize: type.preview,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  // Overlay nameplate + speech bubble (0.9.8): menutupi Canvas,
  // tapi pointerEvents none (diatur di JSX) supaya tidak menghalangi.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Satu kolom per bot: bubble di atas, nameplate di bawah; bagian
  // bawah kolom (nameplate) menempel di jangkar di atas kepala
  // karakter. Kolom digeser -50% dari lebarnya sendiri supaya tepat
  // di atas karakter (left = posisi layar jangkar).
  overlayItem: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: '-50%' }],
  },
  // Nameplate 0.9.10: LEBIH KECIL (font 10, padding ramping) supaya
  // tidak menutupi karakter — dulu 12, kegedean relatif ke blob.
  nameplate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nameplateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  nameplateText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 100,
  },
  bubble: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    maxWidth: 180,
  },
  bubbleText: {
    color: '#1e293b',
    fontSize: 12,
    lineHeight: 16,
  },
  bubbleTail: {
    width: 10,
    height: 10,
    backgroundColor: '#ffffff',
    transform: [{ rotate: '45deg' }],
    alignSelf: 'center',
    marginBottom: -11,
    marginTop: 2,
  },
  // Status tag di bawah karakter (§18.3): panel gelap + teks amber
  // + badge LIVE. Posisi dari jangkar di bawah pangkal karakter
  // (proyeksi kamera, sama seperti nameplate); kolom digeser -50%
  // supaya tepat di bawah karakternya.
  statusTag: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    transform: [{ translateX: '-50%' }],
  },
  liveBadge: {
    backgroundColor: '#dc2626',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  liveBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748b',
  },
  statusTagText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '700',
  },
  legend: {
    maxHeight: 190,
    borderTopWidth: 1,
    borderTopColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  legendTitle: {
    color: colors.muted,
    fontSize: type.small,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 5,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendName: {
    flex: 1,
    color: colors.text,
    fontSize: type.preview,
    fontWeight: '600',
  },
  legendStatus: {
    color: colors.muted,
    fontSize: type.small,
  },
  legendWorking: {
    color: colors.accent,
    fontWeight: '700',
  },
  legendNote: {
    color: colors.mutedDim,
    fontSize: type.tiny,
  },
  empty: {
    color: colors.muted,
    fontSize: type.preview,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
