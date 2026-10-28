// Layar Computer (0.9.5, permintaan Sam: tidak ada fitur computer
// seperti di aplikasi bot lain). Daftar mesin dari GET /api/computers: tiap
// mesin menampilkan label, status registry, badge "Utama" untuk
// primary, dan live device view (HP terhubung, display :100 jalan,
// mirror, umur last shot). Ketuk baris untuk membuka detail.
// Read-only: tidak ada perintah jarak jauh dari layar ini.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  formatAge,
  getComputers,
  isBridgeLive,
  machineStatusLabel,
  type Machine,
} from '../api/computers';
import type { RootStackParamList } from '../navigation';
import { colors, radii, spacing, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ComputerScreen() {
  const navigation = useNavigation<Nav>();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getComputers();
      if (data === null) {
        // 401: token dibutuhkan — tampilkan daftar kosong, bukan error.
        setMachines([]);
        setUnreachable(false);
        return;
      }
      setMachines(data.machines ?? []);
      setUnreachable(false);
    } catch {
      setUnreachable(true);
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

  const renderItem = ({ item }: { item: Machine }) => {
    const expanded = expandedId === item.id;
    const live = isBridgeLive(item);
    const phone = item.devices?.phone;
    return (
      <Pressable
        style={styles.card}
        onPress={() => setExpandedId(expanded ? null : item.id)}
      >
        <View style={styles.rowTop}>
          <View style={[styles.dot, item.status === 'active' ? styles.dotOn : styles.dotOff]} />
          <View style={styles.rowText}>
            <Text style={styles.name} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.meta}>
              {machineStatusLabel(item)}
              {item.primary ? ' · Utama' : ''}
              {live
                ? phone?.connected
                  ? ' · HP terhubung'
                  : ' · HP tidak terhubung'
                : ' · bridge tidak terbaca'}
            </Text>
          </View>
          <Text style={styles.chev}>{expanded ? '▾' : '›'}</Text>
        </View>
        {expanded ? (
          <View style={styles.detail}>
            <Text style={styles.detailLine}>ID: {item.id}</Text>
            <Text style={styles.detailLine}>
              Terakhir terlihat: {item.last_seen || '—'}
            </Text>
            {item.capabilities && item.capabilities.length > 0 ? (
              <Text style={styles.detailLine}>
                Kemampuan: {item.capabilities.join(', ')}
              </Text>
            ) : null}
            {item.notes ? <Text style={styles.detailLine}>Catatan: {item.notes}</Text> : null}
            {live && item.devices ? (
              <>
                <Text style={styles.detailLine}>
                  HP: {phone?.connected ? `terhubung (${phone?.serial ?? 'tanpa serial'})` : 'tidak terhubung'}
                </Text>
                <Text style={styles.detailLine}>
                  Display :100: {item.devices.display.running ? 'jalan' : 'mati'}
                </Text>
                <Text style={styles.detailLine}>
                  Mirror: {item.devices.mirror_running ? 'jalan' : 'mati'}
                </Text>
                <Text style={styles.detailLine}>
                  Last shot HP: {formatAge(item.devices.last_shot.phone?.age_seconds)}
                </Text>
                <Text style={styles.detailLine}>
                  Last shot display: {formatAge(item.devices.last_shot.display?.age_seconds)}
                </Text>
              </>
            ) : (
              <Text style={styles.detailLine}>
                {item.devices_reason ?? 'Bridge tidak terbaca.'}
              </Text>
            )}
          </View>
        ) : null}
      </Pressable>
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
        <Text style={styles.title}>Computer</Text>
        <View style={styles.spacer} />
      </View>
      {unreachable ? (
        <Text style={styles.offline}>Server tidak terjangkau — coba lagi nanti.</Text>
      ) : null}
      <FlatList
        data={machines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {unreachable
              ? 'Daftar computer tidak bisa dimuat.'
              : 'Belum ada computer terdaftar.'}
          </Text>
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
  offline: {
    color: colors.muted,
    fontSize: type.small,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotOn: {
    backgroundColor: colors.accent,
  },
  dotOff: {
    backgroundColor: colors.mutedDim,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: type.name,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontSize: type.small,
  },
  chev: {
    color: colors.muted,
    fontSize: 22,
  },
  detail: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surface2,
    paddingTop: spacing.md,
    gap: 4,
  },
  detailLine: {
    color: colors.muted,
    fontSize: type.small,
    lineHeight: 19,
  },
  empty: {
    color: colors.muted,
    fontSize: type.preview,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
