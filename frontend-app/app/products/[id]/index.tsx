import {NativeScrollEvent, NativeSyntheticEvent, Alert, ActivityIndicator, View} from "react-native";
import {useLocalSearchParams, useNavigation, useRouter} from "expo-router";
import {JSX, useEffect, useState} from "react";
import {AnimatedFAB, Button, useTheme} from 'react-native-paper';
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
    const theme = useTheme()

    // States
    const [product, setProduct] = useState<Product>();
    const [editMode, setEditMode] = useState(edit === "true" || false);
    const [savingState, setSavingState] = useState<"saving" | "success" | undefined>(undefined);
    const [fabExtended, setFabExtended] = useState(true);

    // Effects
    useEffect(() => {
        navigation.setOptions({
            title: product?.name || "Product" ,
            headerRight: editMode ? () => <EditNameButton product={product} onProductNameChange={onProductNameChange}/> : undefined
        });
    }, [navigation, product, editMode]);

    useEffect(() => {
        if (id === "new" && product === undefined) {
            setProduct(newProduct(name, parent ? parseInt(parent) : NaN));
        }
        else if (id !== "new") {
            getProduct(parseInt(id)).then(setProduct);
        }
    }, [id]);

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

    // Sub Render >> Product loading
    if (!product) {
        return (
            <View style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
                <ActivityIndicator size="large"/>
            </View>
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

    const onTypeChange = (newTypeId: number) => {
        setProduct({...product, productTypeID: newTypeId });
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

    const onProductNameChange = (newName: string) => {
        setProduct({...product, name: newName.trim()});
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
        setSavingState("saving");
        saveProduct(product).then((id) => {
            router.setParams({id: id.toString()})
            setEditMode(false);
        }).finally(() => {
            setSavingState("success")
            setTimeout(() => setSavingState(undefined), 1000);
        });
    }

    const synchronizeProduct = () => {
        if (editMode) {return;}
        getProduct(parseInt(id)).then(setProduct);
    }

    const FABicon = () => {
        if (savingState === "saving") {return <ActivityIndicator color={theme.colors.onBackground}/>}
        if (savingState === "success") { return <MaterialCommunityIcons name="check-bold" size={20} color={theme.colors.onBackground}/>}
        if (editMode) { return <MaterialCommunityIcons name="content-save" size={20} color={theme.colors.onBackground}/>}
        return <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.onBackground}/>;
    }

    // Render
    return (
        <>
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
                icon={FABicon}
                onPress={toggleEditMode}
                style={{position: "absolute", right: 0, bottom: 0, overflow: "hidden",  margin: 16}}
                disabled={!isProductValid(product)}
                extended={fabExtended}
                label={editMode? "Save Product": "Edit Product"}
                visible={product.ownedBy === "me"}
            />
        </>
    );
}


function EditNameButton({product, onProductNameChange}: {product: Product | undefined; onProductNameChange?: (newName: string) => void}) {
    const dialog = useDialog();

    const onPress = () => {
        if (!product) {return;}
        dialog.input({
            title: "Edit name",
            placeholder: "Enter a name",
            defaultValue: product.name || "",
            buttons: [
                { text: "Cancel", onPress: () => undefined },
                { text: "OK", onPress: onOK}
            ]
        });
    }

    const onOK = (newName: string | undefined) => {
        if (!newName || newName.trim().length === 0) {
            Alert.alert("Invalid Name", "Product name cannot be empty.");
            return;
        }
        onProductNameChange?.(newName)
    }

    return (<Button onPress={onPress}>Edit name</Button>)
}
