import { useRouter } from 'expo-router';
import { ProductDetailScreen } from '@/components/product/detail/ProductDetailScreen';

export default function ProductNewPage() {
  const router = useRouter();
  return (
    <ProductDetailScreen
      formOptions={{
        role: 'product',
        isNew: true,
        initialEditMode: true,
        onSaveSuccess: (savedId) => {
          router.replace({
            pathname: '/products/[id]',
            params: { id: savedId.toString() },
          });
        },
      }}
    />
  );
}
