import { FlatList, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useState } from "react";

import ProductCard from "@/components/common/ProductCard";
import NewProductModal from "@/components/common/NewProductModal";
import { allProducts } from "@/services/api/fetching";
import { Product } from "@/types/Product";
import { AnimatedFAB, Provider } from "react-native-paper";


export default function DatabaseTab() {
    // States
    const [productList, setProductList] = useState<Required<Product>[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [fabExtended, setFabExtended] = useState(true);

    // Callbacks
    const syncProducts = () => {
        allProducts().then(setProductList);
    }

    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        setFabExtended(event.nativeEvent.contentOffset.y <= 0);
    };

    // Render
    return (
        <Provider>
            <FlatList
                onScroll={onScroll}
                scrollEventThrottle={16}
                onLayout={syncProducts}
                // style={{ padding: 10}}
                contentContainerStyle={{ gap: 15, padding: 10}}
                data={productList}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <ProductCard name={item.name} description={item.description} id={item.id}/>
                )}
            />
            <AnimatedFAB
                icon="plus"
                label="New Product"
                visible={!modalVisible}
                extended={fabExtended}
                onPress={() => setModalVisible(true)}
                style={{position: "absolute", margin: 16, right: 0, bottom: 0}}
            />
            {modalVisible && <NewProductModal onDone={() => setModalVisible(false)} />}
        </Provider>
    );
}
