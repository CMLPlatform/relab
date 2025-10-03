import {useLocalSearchParams, useRouter} from "expo-router";
import {View, Text} from "react-native";
import {useEffect} from "react";
import CPVCard from "@/components/common/CPVCard";

import {Product} from "@/types/Product";

type searchParams = {
    typeSelection?: string;
}

interface Props {
    product: Product;
    editMode: boolean;
    onTypeChange?: (newType: string) => void;
}

export default function ProductType({product, editMode, onTypeChange}: Props){
    // Hooks
    const router = useRouter();
    const { typeSelection } = useLocalSearchParams<searchParams>();

    // Effects
    useEffect(() => {
        if (!typeSelection) return;
        router.setParams({ typeSelection: undefined });
        onTypeChange?.(typeSelection!);
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
                CPVId={product.productType?.name || "Define"}
                onPress={() => {
                    if (!editMode) return;
                    const params = {id: product.id};
                    router.push({pathname: "/products/[id]/category_selection", params: params});
                }}
            />
        </View>
    )
}
