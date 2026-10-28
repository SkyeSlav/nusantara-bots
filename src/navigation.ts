// Daftar rute navigasi. Header bawaan navigation dimatikan di App
// (headerShown: false) karena tiap layar menggambar top bar sendiri.

export type RootStackParamList = {
  Home: undefined;
  Chat: {
    characterId?: string;
    roomId?: string;
    title?: string;
  };
  // Office (Kantor 3D) DIHAPUS dari repo (Sam 28 Okt).
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
