import {useLocalSearchParams, useRouter} from "expo-router";
import {Chip, FAB, Modal, Portal, Surface, Text, TextInput, useTheme} from "react-native-paper";
import {View} from "react-native";
import {useEffect, useState} from "react";

import {Product} from "@/types/Product";
import {useDialog} from "@/components/common/DialogProvider";

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
            <TagChip tagType={"Brand"} text={product.brand} editMode={editMode} onEdit={onEditBrand} />
            <TagChip tagType={"Model"} text={product.model} editMode={editMode} onEdit={onEditModel} />
        </View>
    )
}

function TagChip({tagType, text, editMode, onEdit}: {tagType: string, text?: string, editMode: boolean, onEdit: () => void}){
    // Hooks
    const theme = useTheme();

    // Variables
    let icon = editMode ? "pencil": ""

    // Render
    return(
        <Surface style={{flexDirection: "row", borderRadius: 8, alignItems: "center"}}>
            <Text style={{margin: 6}}>{tagType}</Text>
            <Chip
                onPress={editMode ? onEdit: undefined}
                icon={icon}
                textStyle={{margin: 6}}
                style={{backgroundColor: text ? theme.colors.primaryContainer: theme.colors.errorContainer}}
            >
                {text || "Define"}
            </Chip>
        </Surface>
    )
}
