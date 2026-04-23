import { env as processEnv } from 'node:process';

import { type EnvSource, getOptional } from '@/config/env.ts';

interface NodeRuntimeConfig {
  baseUrl?: string;
  isCi: boolean;
}

export function readNodeRuntimeConfig(env: EnvSource): NodeRuntimeConfig {
  return {
    baseUrl: getOptional(env, 'BASE_URL'),
    isCi: Boolean(getOptional(env, 'CI')),
  };
}

export function getNodeRuntimeConfig(): NodeRuntimeConfig {
  return readNodeRuntimeConfig(processEnv);
}

export type { NodeRuntimeConfig };
