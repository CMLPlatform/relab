import { useLocalSearchParams } from 'expo-router';
import { lazy, Suspense } from 'react';

// NOTE: lazy because three routes share it, which would put it on every route's first load.
const CaptureScreen = lazy(() =>
  import('@/components/product/capture/CaptureScreen').then((m) => ({ default: m.CaptureScreen })),
);

type NewComponentParams = {
  /** Parent id from the URL segment. */
  id: string;
};

/** Create-a-child-component screen for both `components/new` routes; only `parentRole` differs. */
export function NewComponentPage({ parentRole }: { parentRole: 'product' | 'component' }) {
  const params = useLocalSearchParams<NewComponentParams>();
  const parsedParentID = Number.parseInt(params.id ?? '', 10);
  const parentID = Number.isFinite(parsedParentID) ? parsedParentID : undefined;

  return (
    <Suspense fallback={null}>
      <CaptureScreen entityRole="component" parentID={parentID} parentRole={parentRole} />
    </Suspense>
  );
}
