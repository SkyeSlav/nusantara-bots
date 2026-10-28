/**
 * Computer (0.9.5, permintaan Sam: tidak ada fitur computer seperti
 * di aplikasi bot lain). Sumber: GET /api/computers — registry mesin milik
 * pemilik (computers/registry.py) yang digabung dengan live device
 * view dari bridge (computers/devices_merge.py).
 *
 * Bentuk satu mesin (sudah digabung server):
 *   {id, label, owner, status, capabilities, notes, created_at,
 *    last_seen, primary, devices, devices_reason}
 * dengan devices = null bila bridge tidak bisa dibaca (alasan di
 * devices_reason — tidak pernah objek kosong yang pura-pura dicek),
 * atau {available, shared, phone: {connected, serial, state},
 * display: {running}, mirror_running, last_shot: {phone, display}}.
 * Read-only: layar Computer hanya menampilkan, tidak mengirim
 * perintah apa pun ke mesin.
 */

import { apiJson } from './client';

export type MachineStatus = 'active' | 'paused' | 'removed';

export interface MachineDevices {
  available: boolean;
  /** True: perangkat milik pemilik, dibagi ke semua mesin. */
  shared: boolean;
  phone: { connected: boolean; serial: string | null; state: string | null };
  display: { running: boolean };
  mirror_running: boolean;
  last_shot: {
    phone: { ts: string; age_seconds: number; bytes: number } | null;
    display: { ts: string; age_seconds: number; bytes: number } | null;
  };
}

export interface Machine {
  id: string;
  label: string;
  owner: string;
  status: MachineStatus;
  capabilities: string[];
  notes: string;
  created_at: string;
  last_seen: string;
  primary: boolean;
  devices: MachineDevices | null;
  devices_reason: string | null;
}

export interface ComputersResponse {
  machines: Machine[];
  primary_id: string | null;
}

/** GET /api/computers — null on 401 (token needed). */
export async function getComputers(): Promise<ComputersResponse | null> {
  return apiJson<ComputersResponse>('/api/computers');
}

/** Label status registry mesin, bahasa Indonesia. */
export function machineStatusLabel(machine: Machine): string {
  switch (machine.status) {
    case 'active':
      return 'Aktif';
    case 'paused':
      return 'Jeda';
    case 'removed':
      return 'Dihapus';
    default:
      return machine.status;
  }
}

/**
 * Apakah live device view mesin ini bisa dibaca (bridge terjangkau).
 * False berarti devices_reason menjelaskan kenapa — bukan berarti
 * mesinnya mati, hanya bridge-nya tidak bisa dibaca.
 */
export function isBridgeLive(machine: Machine): boolean {
  return machine.devices !== null;
}

/** "5 dtk lalu" / "3 mnt lalu" / "2 jam lalu" untuk umur last shot. */
export function formatAge(ageSeconds: number | null | undefined): string {
  if (typeof ageSeconds !== 'number' || ageSeconds < 0) return '—';
  if (ageSeconds < 60) return `${Math.floor(ageSeconds)} dtk lalu`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} mnt lalu`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)} jam lalu`;
  return `${Math.floor(ageSeconds / 86400)} hari lalu`;
}
