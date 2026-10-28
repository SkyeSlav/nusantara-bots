// Tema visual chat UI — hitam pekat, permukaan abu gelap, aksen toska.
// Nilai diambil dari frame referensi: latar #000, kartu abu gelap,
// teks putih, teks sekunder abu-abu, aksen toska default.

export const colors = {
  background: '#000000',
  surface: '#1e1e1e',
  surface2: '#2a2a2a',
  surface3: '#3a3a3a',
  card: '#4d4d4d',
  text: '#ffffff',
  muted: '#9a9a9a',
  mutedDim: '#6f6f6f',
  accent: '#2dd4bf',
  accentDim: '#5eead4',
  danger: '#ef4444',
  white: '#ffffff',
  black: '#000000',
  // Warna mata blob (gelap, kontras di atas warna blob apa pun).
  blobEye: '#111111',
} as const;

export const radii = {
  pill: 999,
  bubble: 24,
  bubbleSmall: 18,
  card: 12,
  input: 28,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const type = {
  title: 20,
  name: 18,
  body: 17,
  preview: 15,
  small: 14,
  tiny: 12,
} as const;

export const sizes = {
  avatarOwner: 52,
  blobRow: 64,
  blobPill: 36,
  blobMessage: 30,
  composerButton: 52,
  voiceButton: 44,
  topPillHeight: 52,
} as const;
