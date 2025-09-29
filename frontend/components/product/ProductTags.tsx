import {useLocalSearchParams, useRouter} from "expo-router";
import {Chip, FAB, Modal, Portal, Surface, Text, TextInput, useTheme} from "react-native-paper";
import {View} from "react-native";
import {useEffect, useState} from "react";

import {Product} from "@/types/Product";

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
    const theme = useTheme();
    const { brandSelection } = useLocalSearchParams<searchParams>();

    // States
    const [editModelMode, setEditModelMode] = useState(false);
    const [newModel, setNewModel] = useState(product.model || "")

    // Variables
    let icon = editMode ? "pencil": ""

    // Effects
    useEffect(() => {
        if (!brandSelection) return;
        router.setParams({ brandSelection: undefined });
        onBrandChange?.(brandSelection!);
    }, [brandSelection]);

    // Callbacks
    const modelChanged = () => {
        onModelChange?.(newModel)
        setEditModelMode(false)
    }

    // Methods
    const createTag = function(type: string, text: string, onPress?: () => void) {
        return(
            <Surface style={{flexDirection: "row", borderRadius: 8, alignItems: "center"}}>
                <Text style={{margin: 6}}>{type}</Text>
                <Chip onPress={onPress}  icon={icon} textStyle={{margin: 6}}
                      style={{backgroundColor: text==="Define" ? theme.colors.errorContainer: theme.colors.primaryContainer}}
                >{text}</Chip>
            </Surface>
        )
    }

    // Render
    return(
        <View style={{ marginVertical: 12, paddingHorizontal: 16, gap: 10, flexDirection: "row", flexWrap: "wrap" }}>
            {createTag(
                "Brand",
                product.brand || "Define",
                () => {
                    if (!editMode) return;
                    const params = {id: product.id, brand: product.brand};
                    router.push({pathname: "/products/[id]/brand_selection", params: params});
                }
            )}
            {createTag(
                "Model",
                product.model || "Define",
                () => {
                    setEditModelMode(true)
                }
            )}

            {editModelMode && (
                <Portal>
                    <Modal
                        visible={editModelMode}
                        onDismiss={() => setEditModelMode(false)}
                        contentContainerStyle={{backgroundColor: 'white', padding: 16, margin: 10, borderRadius: 12}}
                    >
                        <TextInput
                            placeholder={"Set model"}
                            value={newModel}
                            onChangeText={setNewModel}
                            onSubmitEditing={modelChanged}
                            autoFocus={true}
                        />
                    </Modal>
                    <FAB
                        visible={editModelMode}
                        icon={"check"}
                        onPress={modelChanged}
                        style={{position: "absolute", margin: 16, right: 0, bottom: 0}}
                    />
                </Portal>
            )}

        </View>
    )
}
