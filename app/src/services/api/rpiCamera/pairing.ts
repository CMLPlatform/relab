import { fetchWithAuth } from '@/services/api/auth/authentication';
import { throwFromResponse } from '@/services/api/errors';
import type { CameraRead, PairingClaimRequest } from './shared';
import { PAIRING_BASE } from './shared';

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
