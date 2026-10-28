/**
 * Tests untuk clipboard wrapper (clipboard.ts, 0.10.0 bagian I).
 */
import { copyTextToClipboard } from '../clipboard';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

import * as Clipboard from 'expo-clipboard';

const mockSetString = Clipboard.setStringAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('copyTextToClipboard', () => {
  it('menyalin teks dan mengembalikan true', async () => {
    mockSetString.mockResolvedValueOnce(undefined);
    expect(await copyTextToClipboard('halo')).toBe(true);
    expect(mockSetString).toHaveBeenCalledWith('halo');
  });

  it('fail-soft false bila clipboard tidak tersedia', async () => {
    mockSetString.mockRejectedValueOnce(new Error('no clipboard'));
    expect(await copyTextToClipboard('halo')).toBe(false);
  });
});
