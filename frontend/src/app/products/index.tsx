import { Screen } from '@/lib/ui/components/Screen';
import { Link, Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Button, Card, Chip, Divider, FAB, Searchbar, Text, Tooltip } from 'react-native-paper';

// Import demo data and draft store
import demoData from '@/assets/data/demo.json';
import { useProductCreationStore } from '@/lib/stores/productCreationStore';

// Extract product type from demo data
type Product = (typeof demoData.products)[0];

export default function ProductsScreen() {
  const router = useRouter();
  const { formData, hasDraft, resetForm } = useProductCreationStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const onRefresh = () => {
    setRefreshing(true);
    // Simulate API call delay
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const filteredProducts = demoData.products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.product_type?.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleNewProduct = () => {
    resetForm(); // Clear any existing form data
    router.push('/products/create');
  };

  const handleResumeDraft = () => {
    router.push('/products/create');
  };

  const renderProductCard = (product: Product) => (
    <Card key={product.id} style={{ marginBottom: 12 }}>
      <Card.Content style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text variant="titleMedium" style={{ flex: 1 }}>
            {product.name}
          </Text>
          {product.product_type && (
            <Tooltip title="Product type categorization - Available at launch">
              <Chip compact mode="outlined">
                {product.product_type.name}
              </Chip>
            </Tooltip>
          )}
        </View>

        {product.description && (
          <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
            {product.description}
          </Text>
        )}

        {/* Show a few key properties as chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {product.physical_properties.slice(0, 2).map((prop, index) => (
            <Chip key={index} compact>
              {prop.property_name}: {prop.value}
              {prop.unit ? ` ${prop.unit}` : ''}
            </Chip>
          ))}
          {product.physical_properties.length > 2 && (
            <Chip compact>+{product.physical_properties.length - 2} more</Chip>
          )}
        </View>

        {/* Show component count */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Tooltip title="Component breakdown - Available at launch">
            <Text variant="bodySmall" style={{ opacity: 0.6 }}>
              {product.components.length} component{product.components.length !== 1 ? 's' : ''}
            </Text>
          </Tooltip>
          {product.bill_of_materials && (
            <>
              <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                •
              </Text>
              <Tooltip title="Material composition analysis - Available at launch">
                <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                  {product.bill_of_materials.length} materials
                </Text>
              </Tooltip>
            </>
          )}
        </View>
      </Card.Content>

      <Card.Actions>
        <Link href={`/products/${product.id}`} asChild>
          <Button mode="outlined" compact>
            View Details
          </Button>
        </Link>
      </Card.Actions>
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Stack.Screen name="privacy" options={{ title: 'Product Library' }} />

        {/* Demo Description */}
        <Card style={{ backgroundColor: '#e3f2fd', marginBottom: 16 }}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 8, color: '#1565c0' }}>
              Demo Product Library
            </Text>
            <Text variant="bodyMedium" style={{ color: '#1976d2', lineHeight: 20 }}>
              This is a demonstration of our product data collection and hosting platform for industrial ecology
              research. We&apos;re developing tools to enable users to collect and view product data, analyze aggregated
              metrics by product type, and leverage computer vision and machine learning models to streamline data entry
              and advance AI-assisted research in industrial ecology.
            </Text>
          </Card.Content>
        </Card>

        {/* Draft Notice - Simple single card if draft exists */}
        {hasDraft() && (
          <>
            <Card
              style={{ backgroundColor: '#fff3e0', marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#ff9800' }}
            >
              <Card.Content>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ color: '#e65100', marginBottom: 4 }}>
                      📝 You have a draft in progress
                    </Text>
                    <Text variant="bodyMedium" style={{ color: '#f57c00' }}>
                      {formData.name || 'Untitled Product'} • Last updated{' '}
                      {new Date(formData.lastUpdated).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Button mode="contained" compact onPress={handleResumeDraft} style={{ backgroundColor: '#ff9800' }}>
                    Resume
                  </Button>
                </View>
              </Card.Content>
            </Card>
            <Divider style={{ marginBottom: 16 }} />
          </>
        )}

        <Searchbar
          placeholder="Search products..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={{ marginBottom: 8 }}
        />

        {filteredProducts.length === 0 ? (
          <Card>
            <Card.Content style={{ alignItems: 'center', gap: 12 }}>
              <Text variant="titleMedium">{searchQuery ? 'No matching products found' : 'No products yet'}</Text>
              <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'Products will appear here once they are added to the database'}
              </Text>
              {searchQuery && (
                <Button mode="outlined" onPress={() => setSearchQuery('')}>
                  Clear Search
                </Button>
              )}
            </Card.Content>
          </Card>
        ) : (
          <>
            <Text variant="bodyMedium" style={{ opacity: 0.7, marginBottom: 8 }}>
              {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
              {searchQuery && ` matching "${searchQuery}"`}
            </Text>

            {filteredProducts.map(renderProductCard)}
          </>
        )}
      </Screen>

      <Link href="/products/create" asChild>
        <FAB
          icon="plus"
          label="Register New Product"
          style={{
            position: 'absolute',
            margin: 16,
            right: 0,
            bottom: 0,
          }}
          onPress={handleNewProduct}
        />
      </Link>
    </View>
  );
}
