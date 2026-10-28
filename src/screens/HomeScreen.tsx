// Layar utama — daftar chat. Top bar: avatar pemilik "S" (→ Pengaturan)
// di kiri, pil gelap berisi lonceng + search + "+" di kanan. Tiap baris:
// blob hantu besar + nama tebal + preview abu-abu + jam di kanan.
// Bila server tidak terjangkau, tampil pil "Lokal — server tidak
// terjangkau" (offline-first).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { checkHealth, getCharacters, getChat, getRooms } from '../api/client';
import { roomIdFor } from '../api/botChat';
import type { Character, ChatMessage } from '../api/types';
import { GhostBlob } from '../components/GhostBlob';
import type { RootStackParamList } from '../navigation';
import { colors, radii, sizes, spacing, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type ChatRow = {
  character: Character;
  last: ChatMessage | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const ok = await checkHealth().catch(() => false);
      setHealthy(ok);
      const [chars, rooms] = await Promise.all([
        getCharacters().catch(() => null),
        getRooms().catch(() => null),
      ]);
      const charList = chars ?? [];
      const roomList = rooms ?? [];
      const filled = await Promise.all(
        charList.map(async (c) => {
          const chat = await getChat(roomIdFor(c.id, roomList)).catch(() => null);
          const msgs = chat?.messages ?? [];
          return { character: c, last: msgs.length > 0 ? msgs[msgs.length - 1] : null };
        }),
      );
      // Urutkan: yang terakhir berpesan di atas; yang belum berpesan di bawah.
      filled.sort((a, b) => {
        const ta = a.last ? new Date(a.last.created_at).getTime() : 0;
        const tb = b.last ? new Date(b.last.created_at).getTime() : 0;
        return tb - ta;
      });
      setRows(filled);
    } catch {
      setHealthy(false);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.character.name.toLowerCase().includes(q));
  }, [rows, query]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderRow = ({ item }: { item: ChatRow }) => {
    const { character, last } = item;
    const preview = last
      ? last.text
      : character.summary || character.role || 'No messages yet';
    return (
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate('Chat', { characterId: character.id })}
      >
        <GhostBlob botId={character.id} size={sizes.blobRow} />
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {character.name}
          </Text>
          <Text style={styles.rowPreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <View style={styles.rowRight}>
          {last ? <Text style={styles.rowTime}>{formatTime(last.created_at)}</Text> : null}
          {/*
            Titik unread TIDAK ditampilkan: tidak ada API yang memberi
            data unread, dan titik palsu dilarang. Bila kelak ada data
            unread, titik warna aksen bot tampil di sini.
          */}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.ownerAvatar}
          onPress={() => navigation.navigate('Settings')}
          accessibilityLabel="Pengaturan"
        >
          <Text style={styles.ownerLetter}>S</Text>
        </Pressable>
        <View style={styles.pill}>
          {/* 0.10.16: tombol Kantor (Deck 3D) DISEMBUNYIKAN sementara
              (Sam 28 Okt 07:48 — "belum maksimal"). Kodenya tetap ada
              (DeckScreen + rute Deck); balikin tombol ini + rute di
              App.tsx / navigation.ts bila Sam bilang sudah maksimal. */}
          <Pressable
            style={styles.pillButton}
            onPress={() => navigation.navigate('Computer')}
            accessibilityLabel="Computer"
          >
            <Text style={styles.pillIcon}>💻</Text>
          </Pressable>
          <Pressable
            style={styles.pillButton}
            onPress={() => Alert.alert('Notifikasi', 'Belum ada notifikasi baru.')}
            accessibilityLabel="Notifikasi"
          >
            <Text style={styles.pillIcon}>🔔</Text>
          </Pressable>
          <Pressable
            style={styles.pillButton}
            onPress={() => setSearchOpen((v) => !v)}
            accessibilityLabel="Cari"
          >
            <Text style={styles.pillIcon}>🔍</Text>
          </Pressable>
          <Pressable
            style={styles.pillButton}
            onPress={() => navigation.navigate('CreateSheet')}
            accessibilityLabel="Buat baru"
          >
            <Text style={styles.pillIconPlus}>+</Text>
          </Pressable>
        </View>
      </View>

      {healthy === false ? (
        <View style={styles.offlinePill}>
          <Text style={styles.offlineText}>Lokal — server tidak terjangkau</Text>
        </View>
      ) : null}

      {searchOpen ? (
        <TextInput
          style={styles.searchInput}
          placeholder="Cari bot…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.character.id}
        renderItem={renderRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Belum ada bot — ketuk + untuk membuat bot baru.
          </Text>
        }
        ListFooterComponent={
          <View style={styles.footerLinks}>
            <Pressable style={styles.roomsLink} onPress={() => navigation.navigate('Rooms')}>
              <Text style={styles.roomsLinkText}>Ruangan ›</Text>
            </Pressable>
            <Pressable
              style={styles.roomsLink}
              onPress={() => navigation.navigate('Computer')}
              accessibilityLabel="Computer"
            >
              <Text style={styles.roomsLinkText}>Computer ›</Text>
            </Pressable>
            <Pressable
              style={styles.roomsLink}
              onPress={() => navigation.navigate('Mcp')}
              accessibilityLabel="MCP"
            >
              <Text style={styles.roomsLinkText}>MCP ›</Text>
            </Pressable>
          </View>
        }
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  ownerAvatar: {
    width: sizes.avatarOwner,
    height: sizes.avatarOwner,
    borderRadius: sizes.avatarOwner / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerLetter: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: sizes.topPillHeight,
    paddingHorizontal: spacing.sm,
  },
  pillButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillIcon: {
    fontSize: 20,
    color: colors.text,
  },
  pillIconPlus: {
    fontSize: 26,
    lineHeight: 30,
    color: colors.text,
    fontWeight: '300',
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
  searchInput: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.input,
    color: colors.text,
    fontSize: type.body,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: colors.text,
    fontSize: type.name,
    fontWeight: '700',
  },
  rowPreview: {
    color: colors.muted,
    fontSize: type.preview,
  },
  rowRight: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    paddingTop: 6,
  },
  rowTime: {
    color: colors.muted,
    fontSize: type.small,
  },
  empty: {
    color: colors.muted,
    fontSize: type.preview,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  footerLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
  },
  roomsLink: {
    paddingVertical: spacing.md,
  },
  roomsLinkText: {
    color: colors.accent,
    fontSize: type.preview,
    fontWeight: '600',
  },
});
