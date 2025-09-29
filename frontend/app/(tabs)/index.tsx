import {  FlatList } from "react-native";
import {Redirect, useLocalSearchParams} from "expo-router";
import {useEffect, useState} from "react";

import ProductCard from "@/components/common/ProductCard";
import {allProducts} from "@/services/api/fetching";
import { Product } from "@/types/Product";



type searchParams = {
    authenticated?: string;
}

export default function Main() {
    // Hooks
    const {authenticated} = useLocalSearchParams<searchParams>();

    // States
    const [productList, setProductList] = useState<Required<Product>[]>([]);
    const [loggedIn, setLoggedIn] = useState(false);

    // Effects
    useEffect(() => {
        allProducts().then(setProductList);
    }, []);

    if (authenticated === "true" && !loggedIn) {
        setLoggedIn(true);
    }

    // Sub Render >> Not logged in
    if (!loggedIn) {
        return (
            <Redirect href={"/login"}/>
        )
    }

    // Render
    return (
        <FlatList
            style={{ padding: 10}}
            contentContainerStyle={{ gap: 15 }}
            data={productList}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
                <ProductCard name={item.name} description={item.description} id={item.id}/>
            )}
        />
    );
}
