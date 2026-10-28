// Daftar rute navigasi. Header bawaan navigation dimatikan di App
// (headerShown: false) karena tiap layar menggambar top bar sendiri.

export type RootStackParamList = {
  Home: undefined;
  Chat: {
    characterId?: string;
    roomId?: string;
    title?: string;
  };
  // 0.10.16: rute Deck (Office 3D) dinonaktifkan sementara (Sam 28
  // Okt 07:48 — "belum maksimal"). Balikin baris ini + layar di
  // App.tsx bila Sam bilang sudah maksimal.
  // Deck: undefined;
  Computer: undefined;
  TeamComputer: {
    characterId?: string;
    scope?: 'team' | 'private';
  };
  Mcp: undefined;
  Settings: undefined;
  Rooms: undefined;
  CreateSheet: undefined;
  // SPIKE 0.11.0 — HAPUS SEBELUM RILIS (BUILD-0.11.0-DESIGN.md §7.4).
  OpenUiSpike: undefined;
};
