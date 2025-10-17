import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Searchbar } from 'react-native-paper';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { allBrands } from '@/services/api/fetching';
import { Chip } from '@/components/base';

type searchParams = {
  id: string;
  preset?: string;
};

export default function BrandSelection() {
  // Hooks
  const router = useRouter();
  const { id, preset } = useLocalSearchParams<searchParams>();

  // States
  const [searchQuery, setSearchQuery] = useState(preset || '');
  const [allBrandList, setAllBrandList] = useState<string[]>([]);

  // Methods
  const results = allBrandList.filter((brand) => brand.toLowerCase().includes(searchQuery.toLowerCase()));

  // Effects
  useEffect(() => {
    allBrands().then(setAllBrandList);
  }, []);

  // Callbacks
  const brandSelected = (selectedBrand: string) => {
    const params = { id: id, brandSelection: selectedBrand };
    router.dismissTo({ pathname: '/products/[id]', params: params });
  };

  // Sub Render >> Brand List not loaded yet
  if (allBrandList.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Render
  return (
    <View style={{ padding: 10 }}>
      <Searchbar
        style={{ marginVertical: 10 }}
        placeholder="Search or add brand"
        onChangeText={setSearchQuery}
        value={searchQuery}
      />
      <ScrollView>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            padding: 10,
            justifyContent: 'flex-start',
          }}
        >
          {results.includes(searchQuery) || searchQuery === '' ? null : (
            <Chip onPress={() => brandSelected(searchQuery)} icon={<MaterialCommunityIcons name={'plus'} />}>
              {searchQuery}
            </Chip>
          )}
          {results.map((brand, index) => (
            <Chip key={index} onPress={() => brandSelected(brand)}>
              {brand}
            </Chip>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
