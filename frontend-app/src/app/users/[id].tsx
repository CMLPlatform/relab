import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { Card, Divider } from 'react-native-paper';
import { Text } from '@/components/base';
import ProductCard from '@/components/common/ProductCard';

import { getUserPublicProfile } from '@/services/api/authentication';
import { getUserProducts } from '@/services/api/fetching';
import { Product } from '@/types/Product';
import { User } from '@/types/User';
import { getEarnedBadges, getHighestProductBadge, getHighestTenureBadge } from '@/utils/badges';

export default function UserProfilePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<User | undefined>(undefined);
  const [products, setProducts] = useState<Required<Product>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [showAllProducts, setShowAllProducts] = useState(false);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(undefined);

    Promise.all([getUserPublicProfile(id), getUserProducts(id)])
      .then(([userProfile, userProducts]) => {
        if (!userProfile) {
          setError('User profile not found or is not public');
          return;
        }
        setUser(userProfile);
        setProducts(userProducts);
      })
      .catch((err) => {
        console.error('Error loading user profile:', err);
        setError('Failed to load user profile');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <MaterialCommunityIcons name="alert-circle" size={64} color="#999" />
        <Text style={{ fontSize: 18, marginTop: 20, textAlign: 'center' }}>
          {error || 'User profile not found'}
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 16, color: '#2196F3' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const earnedBadges = getEarnedBadges(user.productCount ?? 0, user.createdAt);
  const highestProductBadge = getHighestProductBadge(user.productCount ?? 0);
  const highestTenureBadge = getHighestTenureBadge(user.createdAt);

  const displayedProducts = showAllProducts ? products : products.slice(0, 3);

  return (
    <ScrollView style={{ flex: 1, padding: 20 }}>
      {/* User Header */}
      <Text
        style={{
          marginTop: 40,
          fontSize: 40,
        }}
      >
        {'Profile'}
      </Text>
      <Text
        style={{
          fontSize: Platform.OS === 'web' ? 40 : 60,
          fontWeight: 'bold',
        }}
        numberOfLines={Platform.OS === 'web' ? undefined : 1}
        adjustsFontSizeToFit={true}
      >
        {user.username}
      </Text>

      {/* User Stats */}
      <View style={{ marginTop: 25, marginBottom: 15 }}>
        <Text style={{ fontSize: 16, opacity: 0.6 }}>Member since {new Date(user.createdAt || '').toLocaleDateString()}</Text>
        <Text style={{ fontSize: 12, opacity: 0.4, marginTop: 5 }}>ID: {user.id}</Text>
      </View>

      {/* Product Count and Highest Badges */}
      <Card style={{ marginVertical: 15 }}>
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <MaterialCommunityIcons name="package-variant" size={24} color="#666" />
            <Text style={{ fontSize: 18, marginLeft: 10, fontWeight: 'bold' }}>
              {user.productCount ?? 0} Products Created
            </Text>
          </View>

          {(highestProductBadge || highestTenureBadge) && (
            <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 }}>
              {highestProductBadge && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons
                    name={highestProductBadge.icon as any}
                    size={24}
                    color={highestProductBadge.color}
                  />
                  <Text style={{ fontSize: 16, marginLeft: 10, color: highestProductBadge.color, fontWeight: 'bold' }}>
                    {highestProductBadge.name}
                  </Text>
                </View>
              )}
              {highestTenureBadge && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons
                    name={highestTenureBadge.icon as any}
                    size={24}
                    color={highestTenureBadge.color}
                  />
                  <Text style={{ fontSize: 16, marginLeft: 10, color: highestTenureBadge.color, fontWeight: 'bold' }}>
                    {highestTenureBadge.name}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Earned Badges */}
      {earnedBadges.length > 0 && (
        <Card style={{ marginVertical: 15 }}>
          <Card.Content>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Achievements</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {earnedBadges.map((badge) => (
                <View
                  key={badge.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#f5f5f5',
                    padding: 10,
                    borderRadius: 8,
                    borderLeftWidth: 3,
                    borderLeftColor: badge.color,
                  }}
                >
                  <MaterialCommunityIcons name={badge.icon as any} size={20} color={badge.color} />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{badge.name}</Text>
                    <Text style={{ fontSize: 12, opacity: 0.6 }}>{badge.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Products Section */}
      {products.length > 0 && (
        <>
          <Divider style={{ marginVertical: 20 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Products</Text>
            {products.length > 3 && (
              <Pressable onPress={() => setShowAllProducts(!showAllProducts)}>
                <Text style={{ fontSize: 16, color: '#2196F3' }}>
                  {showAllProducts ? 'Show Less' : `View All (${products.length})`}
                </Text>
              </Pressable>
            )}
          </View>
          <View style={{ gap: 10 }}>
            {displayedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </View>
        </>
      )}

      {products.length === 0 && (
        <>
          <Divider style={{ marginVertical: 20 }} />
          <View style={{ padding: 20, alignItems: 'center' }}>
            <MaterialCommunityIcons name="package-variant-closed" size={48} color="#999" />
            <Text style={{ marginTop: 10, opacity: 0.6 }}>No products yet</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}
