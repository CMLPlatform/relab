import type { ComponentType } from 'react';

export async function importAnimatedBackgroundModule(): Promise<{
  AnimatedBackground: ComponentType;
}> {
  return import('@/components/common/AnimatedBackground');
}

export async function loadAnimatedBackground(
  importer: typeof importAnimatedBackgroundModule = importAnimatedBackgroundModule,
): Promise<ComponentType> {
  const module = await importer();
  return module.AnimatedBackground;
}
