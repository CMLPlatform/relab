import { useLocalSearchParams } from 'expo-router';
import { CaptureScreen } from '@/components/product/capture/CaptureScreen';

type NewComponentParams = {
  /** Parent id from the URL segment. */
  id: string;
};

/** Create-a-child-component screen for both `components/new` routes; only `parentRole` differs. */
export function NewComponentPage({ parentRole }: { parentRole: 'product' | 'component' }) {
  const params = useLocalSearchParams<NewComponentParams>();
  const parsedParentID = Number.parseInt(params.id ?? '', 10);
  const parentID = Number.isFinite(parsedParentID) ? parsedParentID : undefined;

  return <CaptureScreen entityRole="component" parentID={parentID} parentRole={parentRole} />;
}
