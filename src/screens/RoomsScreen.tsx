// Daftar ruangan (grup / space) dari getRooms. Tap baris membuka chat
// room itu. Tombol kembali ke Home di atas.

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getRooms } from '../api/client';
import {
  deleteRoomChat,
  isProtectedRoom,
  removeRoomFromList,
} from '../api/deleteRoom';
import type { Room } from '../api/types';
import type { RootStackParamList } from '../navigation';
import { colors, radii, spacing, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RoomsScreen() {
  const navigation = useNavigation<Nav>();
  const [rooms, setRooms] = useState<Room[]>([]);

  const load = useCallback(async () => {
    const data = await getRooms().catch(() => null);
    setRooms(data ?? []);
  }, []);

  // Hapus ruangan via long-press (0.9.5). Ruangan baru hilang dari
  // daftar SETELAH server mengonfirmasi — bila gagal, tampilkan
  // error dan ruangan tetap ada (aturan yang sama seperti hapus bot).
  const confirmDeleteRoom = useCallback(
    (room: Room) => {
      if (isProtectedRoom(room.id)) {
        Alert.alert(
          'Tidak bisa dihapus',
          'Ruangan bawaan ("General chat" / "Meeting room") tidak bisa dihapus.',
          [{ text: 'OK' }],
        );
        return;
      }
      Alert.alert(
        `Hapus ruangan "${room.name}"?`,
        'Ruangan ini beserta semua pesannya akan dihapus permanen.',
        [
          {
            text: 'Hapus',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await deleteRoomChat(room.id);
                  setRooms((prev) => removeRoomFromList(prev, room.id));
                  load();
                } catch (e) {
                  Alert.alert(
                    'Gagal menghapus ruangan',
                    e instanceof Error ? e.message : 'Server tidak merespons. Coba lagi.',
                    [{ text: 'OK' }],
                  );
                }
              })();
            },
          },
          { text: 'Batal', style: 'cancel' },
        ],
      );
    },
    [load],
  );

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const renderItem = ({ item }: { item: Room }) => (
    <Pressable
      style={styles.row}
      onPress={() => navigation.navigate('Chat', { roomId: item.id, title: item.name })}
      onLongPress={() => confirmDeleteRoom(item)}
    >
      <View style={styles.icon}>
        <Text style={styles.iconText}>
          {item.mode === 'space' ? '▣' : item.mode === 'meeting' ? '▦' : '👥'}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta}>
          {item.mode === 'space' ? 'space' : item.mode === 'meeting' ? 'meeting' : 'chat'} ·{' '}
          {(item.members ?? []).length} anggota
        </Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => navigation.navigate('Home')} accessibilityLabel="Kembali ke Home">
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>Ruangan</Text>
        <View style={styles.spacer} />
      </View>
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada ruangan. Buat lewat tombol + di Home.</Text>}
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
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
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
  rowMeta: {
    color: colors.muted,
    fontSize: type.small,
  },
  chev: {
    color: colors.muted,
    fontSize: 22,
  },
  empty: {
    color: colors.muted,
    fontSize: type.preview,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
