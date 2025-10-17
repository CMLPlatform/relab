import { useCallback, useEffect, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, RefreshControl, View } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ActivityIndicator, AnimatedFAB, Card, IconButton, Searchbar, SegmentedButtons } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import { useDialog } from '@/components/common/DialogProvider';
import ProductCard from '@/components/common/ProductCard';
import { getUser } from '@/services/api/authentication';
import { allProducts, myProducts } from '@/services/api/fetching';
import { Product } from '@/types/Product';
import { User } from '@/types/User';

type ProductFilter = 'all' | 'mine';

const INFO_CARD_STORAGE_KEY = 'products_info_card_dismissed';

export default function ProductsTab() {
  // Hooks
  const dialog = useDialog();
  const router = useRouter();

  // States
  const [productList, setProductList] = useState<Required<Product>[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Required<Product>[]>([]);
  const [filterMode, setFilterMode] = useState<ProductFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fabExtended, setFabExtended] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showInfoCard, setShowInfoCard] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | undefined>();

  // Callbacks
  const loadProducts = useCallback(() => {
    setLoading(true);
    const fetchFunction = filterMode === 'mine' ? myProducts : allProducts;

    fetchFunction()
      .then((products) => {
        setProductList(products);
      })
      .finally(() => setLoading(false));
  }, [filterMode]);

  // Effects
  useEffect(() => {
    loadProducts();
    loadUser();
    loadInfoCardPreference();
  }, [filterMode, loadProducts]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredProducts(productList);
      return;
    }

    const lowercaseQuery = searchQuery.toLowerCase();
    const filtered = productList.filter(
      (product) =>
        product.name.toLowerCase().includes(lowercaseQuery) ||
        product.description?.toLowerCase().includes(lowercaseQuery),
    );
    setFilteredProducts(filtered);
  }, [productList, searchQuery]);

  // Callbacks
  const loadUser = async () => {
    const user = await getUser();
    setCurrentUser(user);
  };

  const loadInfoCardPreference = async () => {
    try {
      const dismissed = await AsyncStorage.getItem(INFO_CARD_STORAGE_KEY);
      setShowInfoCard(dismissed !== 'true');
    } catch (error) {
      console.error('Failed to load info card preference:', error);
      setShowInfoCard(true);
    }
  };

  const dismissInfoCard = async () => {
    setShowInfoCard(false);
    try {
      await AsyncStorage.setItem(INFO_CARD_STORAGE_KEY, 'true');
    } catch (error) {
      console.error('Failed to save info card preference:', error);
    }
  };

  const onSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  const newProduct = () => {
    if (!currentUser?.isVerified) {
      dialog.alert({
        title: 'Email Verification Required',
        message:
          'Please verify your email address before creating products. Check your inbox for the verification link or go to your Profile to resend it.',
        buttons: [
          { text: 'OK' },
          {
            text: 'Go to Profile',
            onPress: () => router.push('/profile'),
          },
        ],
      });
      return;
    }

    dialog.input({
      title: 'Create New Product',
      placeholder: 'Product Name',
      helperText: 'Enter a descriptive name between 2 and 100 characters',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'OK',
          disabled: (value) => {
            const name = typeof value === 'string' ? value.trim() : '';
            return name.length < 2 || name.length > 100;
          },
          onPress: (productName) => {
            const name = typeof productName === 'string' ? productName.trim() : '';
            const params = { id: 'new', edit: 'true', name };
            router.push({ pathname: '/products/[id]', params });
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
        {showInfoCard === true && (
          <Card>
            <Card.Content>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
                    Welcome to the Relab Products Database
                  </Text>
                  <Text style={{ fontSize: 16 }}>
                    Browse and manage products here. Click the &quot;New Product&quot; button in the bottom right to add
                    a new product.
                  </Text>
                  <Text style={{ marginTop: 8, fontStyle: 'italic', opacity: 0.7 }}>
                    💡 Tip: Make sure to verify your email address to create products.
                  </Text>
                </View>
                <IconButton icon="close" size={20} onPress={dismissInfoCard} />
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Filter Buttons */}
        <SegmentedButtons
          value={filterMode}
          onValueChange={(value) => setFilterMode(value as ProductFilter)}
          buttons={[
            { value: 'all', label: 'All Products', icon: 'database' },
            { value: 'mine', label: 'My Products', icon: 'account' },
          ]}
        />

        {/* Search Bar */}
        <Searchbar
          placeholder="Search products by name or description"
          onChangeText={onSearchChange}
          value={searchQuery}
          icon="magnify"
          clearIcon="close"
        />
      </View>

      {/* Product List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadProducts} />}
          data={filteredProducts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <ProductCard product={item} />}
          ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text>
                {searchQuery
                  ? 'No products found matching your search.'
                  : filterMode === 'mine'
                    ? "You haven't created any products yet. Create your first one!"
                    : 'No products yet. Create your first one!'}
              </Text>
            </View>
          }
        />
      )}

      {/* New Product FAB */}
      <AnimatedFAB
        icon="plus"
        label="New Product"
        extended={fabExtended}
        onPress={newProduct}
        style={{
          position: 'absolute',
          margin: 16,
          right: 0,
          bottom: 0,
        }}
      />
    </>
  );
}
