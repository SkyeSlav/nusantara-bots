// SPIKE 0.11.0 — HAPUS SEBELUM RILIS (lihat BUILD-0.11.0-DESIGN.md §7.4).
//
// Library OpenUI minimal (3 komponen RN) untuk membuktikan Renderer
// jalan di Expo SDK 57 di HP nyata. BUKAN library produksi Fase 1
// (itu `src/api/openuiLibrary.ts`, ditulis setelah spike LOLOS).
// Komponen di sini sengaja kecil dan memakai tema aplikasi yang sama.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  createLibrary,
  defineComponent,
  type ComponentRenderer,
} from '@openuidev/react-lang';
import { z } from 'zod';
import { colors, radii, spacing, type } from '../theme';

// --- Implementasi komponen RN (presentasi murni, tanpa jaringan) ---

type PanelProps = { children: unknown[] };
const PanelView: ComponentRenderer<PanelProps> = ({ props, renderNode }) => (
  <View style={styles.panel}>{renderNode(props.children)}</View>
);

type ChannelCardProps = { name: string; subscribers: string; views: string };
const ChannelCardView: ComponentRenderer<ChannelCardProps> = ({ props }) => (
  <View style={styles.card}>
    <Text style={styles.cardName}>{props.name}</Text>
    <View style={styles.cardRow}>
      <View style={styles.cardStat}>
        <Text style={styles.cardLabel}>Subscriber</Text>
        <Text style={styles.cardValue}>{props.subscribers}</Text>
      </View>
      <View style={styles.cardStat}>
        <Text style={styles.cardLabel}>Views</Text>
        <Text style={styles.cardValue}>{props.views}</Text>
      </View>
    </View>
  </View>
);

type MetricProps = { label: string; value: string; trend?: 'up' | 'down' };
const MetricView: ComponentRenderer<MetricProps> = ({ props }) => (
  <View style={styles.metric}>
    <Text style={styles.cardLabel}>{props.label}</Text>
    <Text style={styles.cardValue}>{props.value}</Text>
    {props.trend ? (
      <Text style={[styles.trend, props.trend === 'up' ? styles.trendUp : styles.trendDown]}>
        {props.trend === 'up' ? '▲ naik' : '▼ turun'}
      </Text>
    ) : null}
  </View>
);

// --- Definisi komponen (skema Zod = kontrak dengan model) ---

const ChannelCard = defineComponent({
  name: 'ChannelCard',
  description: 'Kartu ringkasan channel YouTube: nama, jumlah subscriber, total views.',
  props: z.object({
    name: z.string(),
    subscribers: z.string(),
    views: z.string(),
  }),
  component: ChannelCardView,
});

const Metric = defineComponent({
  name: 'Metric',
  description: 'Satu metrik berlabel, mis. CTR 4,2%. trend up/down bila ada.',
  props: z.object({
    label: z.string(),
    value: z.string(),
    trend: z.enum(['up', 'down']).optional(),
  }),
  component: MetricView,
});

const Panel = defineComponent({
  name: 'Panel',
  description: 'Wadah vertikal utama setiap jawaban.',
  props: z.object({
    children: z.array(z.union([ChannelCard.ref, Metric.ref])),
  }),
  component: PanelView,
});

export const spikeLibrary = createLibrary({
  id: 'nusantara-bots-spike',
  root: 'Panel',
  components: [Panel, ChannelCard, Metric],
});

// --- Program hardcode untuk tes ---

export const SPIKE_PROGRAM_VALID = [
  'root = Panel([card, m1, m2])',
  'card = ChannelCard("Jejak Hikmah", "307", "12.400")',
  'm1 = Metric("CTR rata-rata", "4,2%", "up")',
  'm2 = Metric("Views 28 hari", "12.400", "down")',
].join('\n');

export const SPIKE_PROGRAM_INVALID = [
  'root = Panel([x])',
  'x = WidgetTidakAda("halo")',
].join('\n');

export const SPIKE_PROGRAM_MISSING_PROP = [
  'root = Panel([card])',
  'card = ChannelCard("Jejak Hikmah", "307")',
].join('\n');

// Potongan stream palsu (seperti SSE): root harus muncul sejak chunk 1.
export const SPIKE_STREAM_CHUNKS: string[] = [
  SPIKE_PROGRAM_VALID.slice(0, 30),
  SPIKE_PROGRAM_VALID.slice(30, 110),
  SPIKE_PROGRAM_VALID.slice(110),
];

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardName: {
    color: colors.text,
    fontSize: type.name,
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  cardStat: {
    gap: 2,
  },
  cardLabel: {
    color: colors.muted,
    fontSize: type.small,
  },
  cardValue: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: '700',
  },
  metric: {
    backgroundColor: colors.surface2,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 2,
  },
  trend: {
    fontSize: type.small,
    fontWeight: '700',
  },
  trendUp: {
    color: colors.accent,
  },
  trendDown: {
    color: colors.danger,
  },
});
