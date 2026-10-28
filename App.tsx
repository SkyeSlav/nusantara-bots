// Titik masuk aplikasi — React Navigation (native-stack).
// Home (daftar chat) adalah layar awal. Header bawaan navigation
// DIMATIKAN di semua layar (headerShown: false) karena tiap layar
// menggambar top bar sendiri. CreateSheet tampil sebagai modal
// transparan di atas layar aktif.

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { tryImportByoConfig } from './src/api/byoImport';
import { getByo } from './src/api/byo';
import { recordImportedConfig } from './src/api/modelProfiles';
import { loadAvatarOverrides } from './src/api/avatar';
import { HomeScreen } from './src/screens/HomeScreen';
import { ChatScreen } from './src/screens/ChatScreen';
// 0.10.16: Office (Deck 3D) DISEMBUNYIKAN sementara (Sam 28 Okt
// 07:48 — "belum maksimal"). File DeckScreen tetap ada; balikin
// import + rute di bawah bila Sam bilang sudah maksimal.
// import { DeckScreen } from './src/screens/DeckScreen';
import { ComputerScreen } from './src/screens/ComputerScreen';
import { TeamComputerScreen } from './src/screens/TeamComputerScreen';
import { McpScreen } from './src/screens/McpScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { RoomsScreen } from './src/screens/RoomsScreen';
// SPIKE 0.11.0 — HAPUS SEBELUM RILIS (BUILD-0.11.0-DESIGN.md §7.4).
import { OpenUiSpikeScreen } from './src/screens/OpenUiSpikeScreen';
import { CreateSheet } from './src/components/CreateSheet';
import type { RootStackParamList } from './src/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    // One-time BYO import: reads byo-import.json from the app
    // document directory when present, saves it to SecureStore and
    // deletes the file. Absent/invalid files are ignored silently.
    // 0.10.16: sesudah import (atau bila tidak ada file import),
    // catat config BYO aktif ke profil preset yang cocok
    // (modelProfiles) supaya credential itu diingat untuk pemilih
    // model. Ini juga MIGRASI untuk config BYO dari versi lama
    // (mis. Poolside di emulator / Agnes di HP Sam): tanpa ini,
    // pemilih akan mengira preset aktif "belum ada credential"
    // padahal credential-nya sudah tersimpan di BYO aktif.
    // recordImportedConfig idempotent — aman dipanggil tiap launch.
    tryImportByoConfig()
      .then(async () => {
        const byo = await getByo().catch(() => null);
        if (byo) await recordImportedConfig(byo).catch(() => undefined);
      })
      .catch(() => undefined);
    // Override avatar per bot (0.9.8): muat dari AsyncStorage ke
    // cache api/blob supaya GhostBlob/Ghost3D langsung memakai
    // look yang dipilih Sam (tanpa override = hash deterministik).
    loadAvatarOverrides().catch(() => undefined);
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        {/* 0.10.16: rute Deck (Office 3D) dinonaktifkan sementara — lihat import di atas. */}
        {/* <Stack.Screen name="Deck" component={DeckScreen} /> */}
        <Stack.Screen name="Computer" component={ComputerScreen} />
        <Stack.Screen name="TeamComputer" component={TeamComputerScreen} />
        <Stack.Screen name="Mcp" component={McpScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Rooms" component={RoomsScreen} />
        {/* SPIKE 0.11.0 — HAPUS SEBELUM RILIS. */}
        <Stack.Screen name="OpenUiSpike" component={OpenUiSpikeScreen} />
        <Stack.Screen
          name="CreateSheet"
          component={CreateSheet}
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
