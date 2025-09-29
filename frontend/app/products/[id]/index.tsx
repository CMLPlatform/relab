import {NativeScrollEvent, NativeSyntheticEvent, ScrollView, Alert, Platform} from "react-native";
import {useLocalSearchParams, useNavigation, useRouter} from "expo-router";
import {useEffect, useState} from "react";
import {Card, AnimatedFAB, Provider, Text} from 'react-native-paper';

import ProductImage from "@/components/product/ProductImage";
import ProductDescription from "@/components/product/ProductDescription";
import ProductTags from "@/components/product/ProductTags";
import ProductPhysicalProperties from "@/components/product/ProductPhysicalProperties";
import ProductMetaData from "@/components/product/ProductMetaData";
import ProductComponents from "@/components/product/ProductComponents";
import ProductType from "@/components/product/ProductType";

import { getProduct, newProduct } from "@/services/api/fetching";
import { isProductValid, saveProduct } from "@/services/api/saving";
import { getUser } from "@/services/api/authentication";
import {Product} from "@/types/Product";

/**
 * Type definition for search parameters used in the product page route.
 */
type searchParams = {
    id: string;
    name: string;
    edit?: string;
    parent?: string;
}

/**
 * ProductPage component displays and allows editing of a product.
 *
 * - Fetches product data based on route parameters.
 * - Supports edit mode for modifying product details.
 * - Renders product information and editing controls.
 *
 * @returns {JSX.Element} The product page UI.
 */
export default function ProductPage() {
    // Hooks
    const { id, name, edit, parent } = useLocalSearchParams<searchParams>();
    const navigation = useNavigation();
    const router = useRouter()

    // States
    const [product, setProduct] = useState<Product>();
    const [editMode, setEditMode] = useState(edit === "true" || false);
    const [fabExtended, setFabExtended] = useState(true);

    // Effects
    /**
     * Fetch product data on mount or when id changes.
     * If id is "new", creates a new product instance.
     */
    useEffect(() => {
        navigation.setOptions({
            title: name,
        })

        if (id === "new"){
            setProduct(newProduct(name, parent ? parseInt(parent) : NaN));
        }
        else {
            getProduct(parseInt(id)).then(setProduct);
        }
    }, []);

    useEffect(() => {
        return navigation.addListener("beforeRemove", (e) => {
            if (!editMode) {return;}
            e.preventDefault();
            if (Platform.OS === "web") {
                if (window.confirm("Discard changes?")) {
                    navigation.dispatch(e.data.action);
                }
            } else {
                Alert.alert("Discard changes?", "You have unsaved changes. Are you sure you want to discard them and leave the screen?", [
                    { text: "Don't leave", style: "cancel", onPress: () => {} },
                    { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(e.data.action) },
                ]);
            }
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

    const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        setFabExtended(event.nativeEvent.contentOffset.y <= 0);
    };

    // Methods

    /**
     * Switch between view and edit modes.
     */
    const toggleEditMode = () => {
        setEditMode(!editMode);
        if (!editMode) {return}
        saveProduct(product).then((id) => {
            router.setParams({id: id.toString()})
        });
    }

    const synchronizeProduct = () => {
        if (editMode) {return;}
        console.log("Synchronizing product ", product.name);
        getProduct(parseInt(id)).then(setProduct);
    }

    // Render
    return (
        <Provider>
            <ScrollView contentContainerStyle={{ gap: 15 }} onLayout={synchronizeProduct} onScroll={onScroll} scrollEventThrottle={16}>
                <ProductImage product={product} editMode={editMode} onImagesChange={onImagesChange}/>
                <ProductDescription product={product} editMode={editMode} onChangeDescription={onChangeDescription}/>
                <ProductTags product={product} editMode={editMode} onBrandChange={onBrandChange} onModelChange={onModelChange}/>
                <ProductType product={product} editMode={editMode} onTypeChange={onTypeChange}/>
                <ProductPhysicalProperties product={product} editMode={editMode} onChangePhysicalProperties={onChangePhysicalProperties}/>
                <ProductComponents product={product} editMode={editMode}/>
                <ProductMetaData product={product}/>
            </ScrollView>
            <AnimatedFAB
                icon={editMode? "check-bold": "pencil"}
                onPress={toggleEditMode}
                style={{position: "absolute", margin: 16, right: 0, bottom: 0}}
                disabled={!isProductValid(product)}
                extended={fabExtended}
                label={editMode? "Save Product": "Edit Product"}
                visible={product.ownedBy === "me"}
            />
        </Provider>
    );
}