import { FlatList, NativeSyntheticEvent, NativeScrollEvent, RefreshControl } from 'react-native';
import { useState } from 'react';

import { useRouter } from 'expo-router';
import { AnimatedFAB, Card } from 'react-native-paper';
import { useDialog } from '@/components/common/DialogProvider';
import ProductCard from '@/components/common/ProductCard';
import { allProducts } from '@/services/api/fetching';
import { Product } from '@/types/Product';

export default function ProductsTab() {
  // Hooks
  const dialog = useDialog();
  const router = useRouter();

  // States
  const [productList, setProductList] = useState<Required<Product>[]>([]);
  const [fabExtended, setFabExtended] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInfoCard, setShowInfoCard] = useState(true);

  // Callbacks
  const onRefresh = () => {
    setRefreshing(true);
    allProducts()
      .then(setProductList)
      .finally(() => setRefreshing(false));
  };

  const syncProducts = () => {
    allProducts().then(setProductList);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  const newProduct = () => {
    dialog.input({
      title: 'Create New Product',
      placeholder: 'Product Name',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'OK',
          onPress: (productName) => {
            const params = { id: 'new', edit: 'true', name: productName };
            router.push({ pathname: '/products/[id]', params: params });
          },
        },
      ],
    });
  };

  // Render
  return (
    <>
      <View style={{ padding: 10, gap: 10 }}>
        {/* Info Card */}
        {showInfoCard && (
          <Card>
            <Card.Content>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ marginBottom: 8 }}>
                    Welcome to Relab Products Database
                  </Text>
                  <Text variant="bodyMedium">
                    Browse and manage products here. Click the &quot;New Product&quot; button in the bottom right to add
                    a new product.
                  </Text>
                </View>
                <IconButton icon="close" size={20} onPress={() => setShowInfoCard(false)} />
              </View>
            </Card.Content>
          </Card>
        )}

      <FlatList
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={syncProducts}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        // contentContainerStyle={{padding: 10}}
        data={productList}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <ProductCard product={item} />}
      />
      <AnimatedFAB
        icon="plus"
        label="New Product"
        extended={fabExtended}
        onPress={newProduct}
        style={{ position: 'absolute', margin: 16, right: 0, bottom: 0 }}
      />
    </>
  );
}
