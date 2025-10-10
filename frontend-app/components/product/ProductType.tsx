import {useLocalSearchParams, useRouter} from "expo-router";
import {View} from "react-native";
import {Text} from "@/components/base";
import {useEffect} from "react";
import {CPVCategory} from "@/types/CPVCategory";
import {Product} from "@/types/Product";
import CPVCard from "@/components/common/CPVCard";

import cpvJSON from '@/assets/data/cpv.json';

const cpv = cpvJSON as Record<string, CPVCategory>


type searchParams = {
    typeSelection?: string;
}

interface Props {
    product: Product;
    editMode: boolean;
    onTypeChange?: (newType: number) => void;
}

export default function ProductType({product, editMode, onTypeChange}: Props){
    // Hooks
    const router = useRouter();
    const { typeSelection } = useLocalSearchParams<searchParams>();

    // Effects
    useEffect(() => {
        if (!typeSelection) return;
        router.setParams({ typeSelection: undefined });
        onTypeChange?.(parseInt(typeSelection));
    }, [typeSelection]);

    // Render
    return (
        <View style={{ padding: 14}}>
            <Text
                style={{
                    marginBottom: 12,
                    fontSize: 24,
                    fontWeight: "bold",
                }}
            >
                Type or Material
            </Text>
            <CPVCard
                CPV={cpv[product.productTypeID || "root"]}
                onPress={() => {
                    if (!editMode) return;
                    const params = {id: product.id};
                    router.push({pathname: "/products/[id]/category_selection", params: params});
                }}
            />
        </View>
    )
}
