import {useLocalSearchParams, useRouter} from "expo-router";
import {Chip} from "@/components/base";
import {View} from "react-native";
import {useEffect} from "react";

import {Product} from "@/types/Product";
import {useDialog} from "@/components/common/DialogProvider";
import {MaterialCommunityIcons} from "@expo/vector-icons";

type searchParams = {
    brandSelection?: string;
}

interface Props {
    product: Product;
    editMode: boolean;
    onBrandChange?: (newBrand: string) => void;
    onModelChange?: (newModel: string) => void;
}

export default function ProductTags({product, editMode, onBrandChange, onModelChange}: Props){
    // Hooks
    const router = useRouter();
    const dialog = useDialog();
    const { brandSelection } = useLocalSearchParams<searchParams>();

    // Effects
    useEffect(() => {
        if (!brandSelection) return;
        router.setParams({ brandSelection: undefined });
        onBrandChange?.(brandSelection!);
    }, [brandSelection]);

    // Callbacks
    const onEditBrand = () => {
        if (!editMode) return;
        const params = {id: product.id, brand: product.brand};
        router.push({pathname: "/products/[id]/brand_selection", params: params});
    }

    const onEditModel = () => {
        if (!editMode) return;
        dialog.input({
            title: "Set Model",
            placeholder: "Model Name",
            defaultValue: product.model || "",
            buttons: [
                { text: "Cancel", onPress: () => undefined },
                { text: "OK", onPress: (modelName) => {
                    onModelChange?.(modelName || "");
                }}
            ]
        });
    }



    // Render
    return(
        <View style={{ marginVertical: 12, paddingHorizontal: 16, gap: 10, flexDirection: "row", flexWrap: "wrap" }}>
            <Chip
                title={"Brand"}
                onPress={onEditBrand}
                icon={editMode && <MaterialCommunityIcons name={"pencil"}/>}
                error={!product.brand}
            >
                {product.brand || "Define"}
            </Chip>
            <Chip
                title={"Model"}
                onPress={onEditModel}
                icon={editMode && <MaterialCommunityIcons name={"pencil"}/>}
                error={!product.model}
            >
                {product.model || "Define"}
            </Chip>
        </View>
    )
}
