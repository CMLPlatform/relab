import { describe, expect, it } from '@jest/globals';
import { resolveEffectiveCameraConnection } from '../useEffectiveCameraConnection';

describe('resolveEffectiveCameraConnection', () => {
  it('uses relay reachability when the backend status is online', () => {
    const result = resolveEffectiveCameraConnection({
      status: { connection: 'online', last_seen_at: null, details: null },
    });

    expect(result).toMatchObject({
      status: 'online',
      relayStatus: 'online',
      transport: 'relay',
      isReachable: true,
      canUseRelay: true,
      canUseDirect: false,
      detailLabel: null,
    });
  });

  it('promotes a relay-offline camera to online when direct local mode is active', () => {
    const result = resolveEffectiveCameraConnection(
      {
        status: { connection: 'offline', last_seen_at: null, details: null },
      },
      {
        mode: 'local',
        localBaseUrl: 'http://192.168.7.1:8018',
        localMediaUrl: 'http://192.168.7.1:8888',
        localApiKey: 'local-key',
      },
    );

    expect(result).toMatchObject({
      status: 'online',
      relayStatus: 'offline',
      transport: 'direct',
      isReachable: true,
      canUseRelay: false,
      canUseDirect: true,
      detailLabel: 'Direct connection',
    });
  });

  it('preserves non-online relay status when neither relay nor direct mode is reachable', () => {
    const result = resolveEffectiveCameraConnection({
      status: { connection: 'unauthorized', last_seen_at: null, details: null },
    });

    expect(result).toMatchObject({
      status: 'unauthorized',
      relayStatus: 'unauthorized',
      transport: 'unreachable',
      isReachable: false,
      canUseRelay: false,
      canUseDirect: false,
    });
  });
});
