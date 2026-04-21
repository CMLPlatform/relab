import { fetchWithAuth } from '@/services/api/authentication';
import type { CameraRead, PairingClaimRequest } from './shared';
import { PAIRING_BASE, throwFromResponse } from './shared';

export async function claimPairingCode(data: PairingClaimRequest): Promise<CameraRead> {
  const resp = await fetchWithAuth(`${PAIRING_BASE}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    await throwFromResponse(resp, 'Pairing failed');
  }
  return resp.json() as Promise<CameraRead>;
}
