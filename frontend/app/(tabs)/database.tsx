import {  FlatList } from "react-native";
import {Redirect, useLocalSearchParams, useRouter} from "expo-router";
import {useEffect, useState} from "react";

import ProductCard from "@/components/common/ProductCard";
import NewProductModal from "@/components/common/NewProductModal";
import {allProducts} from "@/services/api/fetching";
import { Product } from "@/types/Product";
import {FAB, Provider} from "react-native-paper";


export default function Main() {
    // States
    const [productList, setProductList] = useState<Required<Product>[]>([]);
    const [modalVisible, setModalVisible] = useState(false);

    // Callbacks
    const syncProducts = () => {
        allProducts().then(setProductList);
    }

    // Effects
    useEffect(syncProducts, []);

    // Render
    return (
        <Provider>
            <FlatList
                onLayout={syncProducts}
                style={{ padding: 10}}
                contentContainerStyle={{ gap: 15 }}
                data={productList}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <ProductCard name={item.name} description={item.description} id={item.id}/>
                )}
            />
            <FAB
                icon="plus"
                label="Add Product"
                visible={!modalVisible}
                onPress={() => setModalVisible(true)}
                style={{position: "absolute", margin: 16, right: 0, bottom: 0}}
            />
            {modalVisible && <NewProductModal onDone={() => setModalVisible(false)} />}
        </Provider>
    );
}
