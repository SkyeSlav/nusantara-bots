// SPIKE 0.11.0 — HAPUS SEBELUM RILIS (lihat BUILD-0.11.0-DESIGN.md §7.4).
//
// Layar tes tersembunyi: membuktikan Renderer OpenUI jalan di Expo
// SDK 57 di HP nyata. Hanya bisa dibuka dari Settings saat __DEV__
// (build debug). Tiga bagian:
//   1. Program valid hardcode → harus tampil ChannelCard + 2 Metric.
//   2. Program invalid hardcode → harus fallback (teks), BUKAN crash.
//   3. Stream palsu (3 chunk via createStreamingParser) → root muncul
//      sejak chunk 1, 0 error di akhir.

import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Renderer } from '@openuidev/react-lang';
import { createParser, createStreamingParser } from '@openuidev/lang-core';
import {
  SPIKE_PROGRAM_INVALID,
  SPIKE_PROGRAM_MISSING_PROP,
  SPIKE_PROGRAM_VALID,
  SPIKE_STREAM_CHUNKS,
  spikeLibrary,
} from '../api/openuiSpike';
import { colors, radii, spacing, type } from '../theme';

// Penangkap error render — bila Renderer melempar saat render,
// layar tetap hidup dan menampilkan pesan, bukan crash aplikasi.
class SpikeErrorBoundary extends React.Component<
  { children: React.ReactNode; label: string },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message || String(e) };
  }
  componentDidCatch() {
    // Sengaja diam — status error sudah tampil di layar.
  }
  render() {
    if (this.state.error) {
      return (
        <Text style={styles.errorText}>
          RENDER ERROR ({this.props.label}): {this.state.error}
        </Text>
      );
    }
    return this.props.children;
  }
}

export function OpenUiSpikeScreen() {
  const navigation = useNavigation();
  const schema = useMemo(() => spikeLibrary.toJSONSchema(), []);

  // Status parse (dihitung sekali, untuk verifikasi via screenshot).
  const parseStatus = useMemo(() => {
    const parser = createParser(schema, 'Panel');
    const valid = parser.parse(SPIKE_PROGRAM_VALID);
    const invalid = parser.parse(SPIKE_PROGRAM_INVALID);
    const missing = parser.parse(SPIKE_PROGRAM_MISSING_PROP);
    return {
      validRoot: Boolean(valid.root),
      validErrors: valid.meta.errors.length,
      validStatements: valid.meta.statementCount,
      invalidErrors: invalid.meta.errors.length,
      invalidRoot: Boolean(invalid.root),
      missingErrors: missing.meta.errors.length,
    };
  }, [schema]);

  const [invalidErrors, setInvalidErrors] = useState<number | null>(null);
  const [streamText, setStreamText] = useState('');
  const [streamRoot, setStreamRoot] = useState(false);
  const [streamErrors, setStreamErrors] = useState<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  const streamParserRef = useRef<ReturnType<typeof createStreamingParser> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const runFakeStream = () => {
    if (streaming) return;
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    setStreaming(true);
    setStreamText('');
    setStreamRoot(false);
    setStreamErrors(null);
    streamParserRef.current = createStreamingParser(schema, 'Panel');
    let acc = '';
    SPIKE_STREAM_CHUNKS.forEach((chunk, i) => {
      timersRef.current.push(
        setTimeout(() => {
          acc += chunk;
          const res = streamParserRef.current?.push(chunk);
          setStreamText(acc);
          setStreamRoot(Boolean(res?.root));
          if (i === SPIKE_STREAM_CHUNKS.length - 1) {
            const fin = streamParserRef.current?.push('', true);
            setStreamErrors(fin?.meta.errors.length ?? -1);
            setStreaming(false);
          }
        }, 400 * (i + 1)),
      );
    });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Kembali">
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.title}>Tes UI — SPIKE (sementara)</Text>
      </View>

      <Text style={styles.sectionTitle}>Status parser (lang-core)</Text>
      <Text style={styles.status}>
        Program valid: root {parseStatus.validRoot ? 'OK' : 'HILANG'}, {parseStatus.validErrors}{' '}
        error, {parseStatus.validStatements} statement
      </Text>
      <Text style={styles.status}>
        Program rusak: {parseStatus.invalidErrors} error, root{' '}
        {parseStatus.invalidRoot ? 'tetap ada' : 'hilang'}
      </Text>
      <Text style={styles.status}>
        Program prop hilang: {parseStatus.missingErrors} error
      </Text>

      <Text style={styles.sectionTitle}>1. Program valid (harus tampil kartu + 2 metrik)</Text>
      <SpikeErrorBoundary label="valid">
        <Renderer
          response={SPIKE_PROGRAM_VALID}
          library={spikeLibrary}
          isStreaming={false}
          onError={() => undefined}
        />
      </SpikeErrorBoundary>

      <Text style={styles.sectionTitle}>2. Program invalid (harus fallback, bukan crash)</Text>
      <SpikeErrorBoundary label="invalid">
        <Renderer
          response={SPIKE_PROGRAM_INVALID}
          library={spikeLibrary}
          isStreaming={false}
          onError={(errs) => setInvalidErrors(errs.length)}
        />
      </SpikeErrorBoundary>
      {invalidErrors !== null && invalidErrors > 0 ? (
        <Text style={styles.fallbackText}>
          Fallback OK: program tidak bisa di-render ({invalidErrors} error) — menampilkan teks
          biasa.
        </Text>
      ) : null}

      <Text style={styles.sectionTitle}>3. Stream palsu (3 chunk)</Text>
      <Pressable style={styles.button} onPress={runFakeStream} disabled={streaming}>
        <Text style={styles.buttonText}>{streaming ? 'Streaming…' : 'Jalankan stream'}</Text>
      </Pressable>
      <Text style={styles.status}>
        Stream: root {streamRoot ? 'muncul' : 'belum'}, error akhir{' '}
        {streamErrors === null ? '—' : String(streamErrors)}
      </Text>
      {streamText ? (
        <SpikeErrorBoundary label="stream">
          <Renderer
            response={streamText}
            library={spikeLibrary}
            isStreaming={streaming}
            onError={() => undefined}
          />
        </SpikeErrorBoundary>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backIcon: {
    color: colors.text,
    fontSize: 24,
  },
  title: {
    color: colors.text,
    fontSize: type.title,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: type.preview,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  status: {
    color: colors.text,
    fontSize: type.small,
    lineHeight: 20,
  },
  fallbackText: {
    color: colors.muted,
    fontSize: type.small,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: type.small,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.black,
    fontSize: type.preview,
    fontWeight: '700',
  },
});
