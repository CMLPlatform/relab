import {NativeScrollEvent, NativeSyntheticEvent, ScrollView, Alert, ActivityIndicator} from "react-native";
import {useLocalSearchParams, useNavigation, useRouter} from "expo-router";
import {JSX, useEffect, useState} from "react";
import {Card, AnimatedFAB, Provider, Text, Button } from 'react-native-paper';
import {MaterialCommunityIcons} from "@expo/vector-icons";
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import ProductImage from "@/components/product/ProductImage";
import ProductDescription from "@/components/product/ProductDescription";
import ProductTags from "@/components/product/ProductTags";
import ProductPhysicalProperties from "@/components/product/ProductPhysicalProperties";
import ProductMetaData from "@/components/product/ProductMetaData";
import ProductComponents from "@/components/product/ProductComponents";
import ProductType from "@/components/product/ProductType";
import ProductDelete from "@/components/product/ProductDelete";

import {useDialog} from "@/components/common/DialogProvider";

import {Product} from "@/types/Product";
import { getProduct, newProduct } from "@/services/api/fetching";
import { isProductValid, saveProduct, deleteProduct } from "@/services/api/saving";

/**
 * Type definition for search parameters used in the product page route.
 */
type searchParams = {
    id: string;
    name: string;
    edit?: string;
    parent?: string;
}


export default function ProductPage(): JSX.Element {
    // Hooks
    const { id, name, edit, parent } = useLocalSearchParams<searchParams>();
    const navigation = useNavigation();
    const router = useRouter()
    const dialog = useDialog();

    // States
    const [product, setProduct] = useState<Product>();
    const [editMode, setEditMode] = useState(edit === "true" || false);
    const [saving, setSaving] = useState(false);
    const [fabExtended, setFabExtended] = useState(true);

    // Effects
    useEffect(() => {
        navigation.setOptions({
            title: product?.name || "Product" ,
            headerRight: editMode ? () => (
                <Button
                    onPress={() => {
                        if (!product) {return;}
                        dialog.input({
                            title: "Edit name",
                            placeholder: "Enter a name",
                            defaultValue: product.name || "",
                            buttons: [
                                { text: "Cancel", onPress: () => undefined },
                                { text: "OK", onPress: (newName) => {
                                    if (!newName || newName.trim().length === 0) {
                                        Alert.alert("Invalid Name", "Product name cannot be empty.");
                                        return;
                                    }
                                    setProduct({...product, name: newName.trim()});
                                }}
                            ]
                        });
                    }}
                >
                    Edit name
                </Button>
            ) : undefined
        });
    }, [navigation, product, editMode]);

    useEffect(() => {
        if (id === "new" && product === undefined) {
            setProduct(newProduct(name, parent ? parseInt(parent) : NaN));
        }
        else if (id !== "new") {
            getProduct(parseInt(id)).then(setProduct);
        }
    }, []);

    useEffect(() => {
        return navigation.addListener("beforeRemove", (e) => {
            if (!editMode) {return;}
            e.preventDefault();

            dialog.alert({
                title: "Discard changes?",
                message: "You have unsaved changes. Are you sure you want to discard them and leave the screen?",
                buttons: [
                    { text: "Don't leave", onPress: () => {} },
                    { text: "Discard", onPress: () => navigation.dispatch(e.data.action) },
                ]
            });
        });
    }, [navigation, editMode]);

    // Sub Render >> Product not found
    if (!product) {
        return (
            <Card>
                <Card.Content style={{ alignItems: 'center', gap: 12 }}>
                    <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                        The requested product could not be found.
                    </Text>
                </Card.Content>
            </Card>
        );
    }

    // Callbacks
    const onChangeDescription = (newDescription: string) => {
        setProduct({...product, description: newDescription});
    }

    const onChangePhysicalProperties = (newProperties: typeof product.physicalProperties) => {
        setProduct({...product, physicalProperties: newProperties});
    }

    const onBrandChange = (newBrand: string) => {
        setProduct({...product, brand: newBrand});
    }

    const onModelChange = (newModel: string) => {
        setProduct({...product, model: newModel});
    }

    const onTypeChange = (newType: string) => {
        setProduct({...product, productType: {id: 0, name: newType, description: ""} });
    }

    const onImagesChange = (newImages: { url: string, description: string, id: number }[]) => {
        setProduct({...product, images: newImages});
    }

    const onProductDelete = () => {
        deleteProduct(product).then(() => {
            setEditMode(false);
            router.replace("/(tabs)/database");
        })
    }

    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        setFabExtended(event.nativeEvent.contentOffset.y <= 0);
    };

    // Methods

    /**
     * Switch between view and edit modes.
     */
    const toggleEditMode = () => {
        if(!editMode){return setEditMode(true);}
        setSaving(true);
        saveProduct(product).then((id) => {
            router.setParams({id: id.toString()})
            setEditMode(false);
        }).finally(() => setSaving(false));
    }

    const synchronizeProduct = () => {
        if (editMode) {return;}
        getProduct(parseInt(id)).then(setProduct);
    }

    // Render
    return (
        <Provider>
            <KeyboardAwareScrollView
                contentContainerStyle={{ gap: 15 , paddingBottom: 5 }}
                onLayout={synchronizeProduct}
                onScroll={onScroll}
                scrollEventThrottle={16}
            >
                <ProductImage product={product} editMode={editMode} onImagesChange={onImagesChange}/>
                <ProductDescription product={product} editMode={editMode} onChangeDescription={onChangeDescription}/>
                <ProductTags product={product} editMode={editMode} onBrandChange={onBrandChange} onModelChange={onModelChange}/>
                <ProductType product={product} editMode={editMode} onTypeChange={onTypeChange}/>
                <ProductPhysicalProperties product={product} editMode={editMode} onChangePhysicalProperties={onChangePhysicalProperties}/>
                <ProductComponents product={product} editMode={editMode}/>
                <ProductMetaData product={product}/>
                <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete}/>
            </KeyboardAwareScrollView>
            <AnimatedFAB
                icon={() =>
                    saving ? (
                        <ActivityIndicator color={"black"}/>
                    ) : editMode? (
                        <MaterialCommunityIcons name="content-save" size={20}/>
                    ) : (<MaterialCommunityIcons name="pencil" size={20}/>)
                }
                onPress={toggleEditMode}
                style={{position: "absolute", margin: 15, right: 0, bottom: 5}}
                disabled={!isProductValid(product)}
                extended={fabExtended}
                label={editMode? "Save Product": "Edit Product"}
                visible={product.ownedBy === "me"}
            />
        </Provider>
    );
}
