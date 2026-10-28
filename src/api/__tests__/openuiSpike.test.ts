// Tes spike 0.11.0 — library 3 komponen + parser lang-core.
// react-native di-mock virtual (pola 0.9.8): modul spike hanya butuh
// View/Text/StyleSheet sebagai penanda, tidak pernah di-render di sini.
// Render sungguhan dibuktikan di HP (layar OpenUiSpikeScreen).
jest.mock(
  'react-native',
  () => ({
    View: 'View',
    Text: 'Text',
    StyleSheet: { create: (s: unknown) => s as Record<string, unknown> },
  }),
  { virtual: true },
);

import { createParser, createStreamingParser, generateSystemPrompt } from '@openuidev/lang-core';
import {
  SPIKE_PROGRAM_INVALID,
  SPIKE_PROGRAM_MISSING_PROP,
  SPIKE_PROGRAM_VALID,
  SPIKE_STREAM_CHUNKS,
  spikeLibrary,
} from '../openuiSpike';

describe('spike library', () => {
  it('spec: root Panel, 3 komponen', () => {
    const spec = spikeLibrary.toSpec();
    expect(spec.root).toBe('Panel');
    expect(Object.keys(spec.components ?? {})).toEqual(
      expect.arrayContaining(['Panel', 'ChannelCard', 'Metric']),
    );
    expect(Object.keys(spec.components ?? {}).length).toBe(3);
  });

  it('program valid: 0 error, root ada, 4 statement', () => {
    const schema = spikeLibrary.toJSONSchema();
    const res = createParser(schema, 'Panel').parse(SPIKE_PROGRAM_VALID);
    expect(res.meta.errors).toEqual([]);
    expect(res.root).toBeTruthy();
    expect(res.meta.statementCount).toBe(4);
    expect(res.meta.incomplete).toBe(false);
  });

  it('program rusak: error terstruktur unknown-component, root tetap ada', () => {
    const schema = spikeLibrary.toJSONSchema();
    const res = createParser(schema, 'Panel').parse(SPIKE_PROGRAM_INVALID);
    expect(res.meta.errors.length).toBeGreaterThan(0);
    expect(res.meta.errors[0].code).toBe('unknown-component');
    expect(res.root).toBeTruthy();
  });

  it('program prop hilang: error missing-required menyebut signature', () => {
    const schema = spikeLibrary.toJSONSchema();
    const res = createParser(schema, 'Panel').parse(SPIKE_PROGRAM_MISSING_PROP);
    expect(res.meta.errors.length).toBeGreaterThan(0);
    expect(res.meta.errors[0].code).toBe('missing-required');
    expect(JSON.stringify(res.meta.errors[0])).toContain('ChannelCard');
  });

  it('streaming: root sejak chunk 1, 0 error di akhir', () => {
    const schema = spikeLibrary.toJSONSchema();
    const sp = createStreamingParser(schema, 'Panel');
    let firstRoot = false;
    SPIKE_STREAM_CHUNKS.forEach((chunk, i) => {
      const r = sp.push(chunk);
      if (i === 0) firstRoot = Boolean(r.root);
    });
    const fin = sp.push('', true);
    expect(firstRoot).toBe(true);
    expect(fin.meta.errors).toEqual([]);
    expect(fin.root).toBeTruthy();
  });

  it('prompt inlineMode menyebut komponen + aturan bahasa', () => {
    const spec = spikeLibrary.toSpec();
    const prompt = generateSystemPrompt({
      library: spec,
      promptOptions: {
        inlineMode: true,
        additionalRules: ['Jawab dalam Bahasa Indonesia.'],
      },
    });
    expect(prompt).toContain('ChannelCard');
    expect(prompt).toContain('Metric');
    expect(prompt).toContain('Bahasa Indonesia');
    expect(prompt.length).toBeLessThan(6000);
  });
});
