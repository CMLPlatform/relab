import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Dimensions, FlatList, View } from 'react-native';
import { Card, Icon, Searchbar, Text } from 'react-native-paper';
import CPVCard from '@/components/common/CPVCard';

import cpvJSON from '@/assets/data/cpv.json';
import cvpClassificationsJSON from '@/assets/data/cpv_classifications.json';
import productTypesMapping from '@/assets/data/product-types.json';

const cpv: Record<string, string> = cpvJSON as Record<string, string>;
const cpvClassifications = cvpClassificationsJSON as cpvItem;

interface cpvItem {
  id: string;
  name: string;
  type: string;
  total: number;
  children: Record<string, cpvItem>;
}

type searchParams = {
  id: string;
};

export default function CategorySelection() {
  // Hooks
  const router = useRouter();
  const { id } = useLocalSearchParams<searchParams>();

  // States
  const [searchQuery, setSearchQuery] = useState('');
  const [cpvClass, setCpvClass] = useState(cpvClassifications);
  const [history, setHistory] = useState<cpvItem[]>([cpvClassifications]);

  // Callbacks
  const selectedBranch = (item: cpvItem) => {
    setHistory([...history, item]);
    setCpvClass(item);
  };

  const typeSelected = function (selectedCpvCode: string) {
    // Look up the product type ID from the CPV code
    const mapping = productTypesMapping.find((item) => item.name === selectedCpvCode);

    if (mapping) {
      const params = {
        id: id,
        typeSelection: mapping.id,
      };
      router.dismissTo({ pathname: '/products/[id]', params: params });
    } else {
      console.warn('No product type ID found for CPV code:', selectedCpvCode);
    }
  };

  // Methods
  const filteredCPV = () => {
    return Object.entries(cpv).filter(
      ([key, value]) => key.startsWith(cpvClass.id) && value.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  };

  // Render
  return (
    <View style={{ flex: 1 }}>
      <Searchbar
        style={{ position: 'absolute', top: 15, left: 15, right: 15, zIndex: 1 }}
        placeholder="Search"
        onChangeText={setSearchQuery}
        value={searchQuery}
      />
      {history.length > 1 && (
        <Card
          style={{ position: 'absolute', top: 80, left: 15, right: 15, zIndex: 1 }}
          onPress={() => {
            const newHistory = [...history];
            newHistory.pop();
            setHistory(newHistory);
            setCpvClass(newHistory[newHistory.length - 1]);
          }}
        >
          <Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon size={20} source={'chevron-left'} />
            <Text variant="bodySmall">{history[history.length - 1].name}</Text>
          </Card.Content>
        </Card>
      )}
      {cpvClass.type !== 'category' && searchQuery === '' && (
        <FlatList
          contentContainerStyle={{
            gap: 15,
            paddingTop: history.length > 1 ? 145 : 85,
            paddingBottom: 20,
          }}
          numColumns={2}
          data={Object.values(cpvClass.children)}
          renderItem={({ item }) => <CPVItemCard cpvItem={item} setCPV={selectedBranch} />}
        />
      )}
      {(searchQuery !== '' || cpvClass.type === 'category') && (
        <FlatList
          contentContainerStyle={{
            gap: 15,
            padding: 15,
            paddingTop: history.length > 1 ? 145 : 85,
            marginBottom: 20,
          }}
          data={filteredCPV()}
          renderItem={({ item }) => {
            const [id, name] = item;
            return <CPVCard CPVId={id} onPress={() => typeSelected(id)} />;
          }}
        />
      )}
    </View>
  );
}

function CPVItemCard({ cpvItem, setCPV }: { cpvItem: cpvItem; setCPV?: (cpv: cpvItem) => void }) {
  const size = Dimensions.get('window').width / 2 - 25;

  return (
    <Card style={{ marginLeft: 16, marginRight: 0 }} onPress={() => setCPV?.(cpvItem)}>
      <View style={{ width: size, height: size, padding: 20 }}>
        <Text variant="bodySmall" style={{ opacity: 0.7 }}>
          {cpvItem.name}
        </Text>
        <Text
          variant="titleLarge"
          style={{
            opacity: 0.1,
            position: 'absolute',
            bottom: 0,
            right: 5,
            fontWeight: '900',
            fontSize: 80,
            lineHeight: 80,
          }}
        >
          {cpvItem.total}
        </Text>
      </View>
    </Card>
  );
}
