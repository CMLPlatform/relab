import {FlatList, View, Dimensions, Pressable, Text} from "react-native";
import {Image} from "expo-image";
import {Icon} from "react-native-paper";
import {useLocalSearchParams, useRouter} from "expo-router";
import {useEffect, useRef} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {Product} from "@/types/Product";

type searchParams = {
    photoTaken?: "taken" | "set";
}

interface Props {
    product: Product;
    editMode: boolean;
    onImagesChange?: (images: { url: string, description: string, id: number }[]) => void;
}

export default function ProductImages({product, editMode, onImagesChange}: Props) {
    // Hooks
    const router = useRouter();
    const {photoTaken} = useLocalSearchParams<searchParams>();
    const imageGallery = useRef<FlatList>(null);
    const width = Dimensions.get('window').width;

    // Effects
    useEffect(() => {
        // If a photo was taken, get it from AsyncStorage and add it to the product images
        if (photoTaken === "taken"){
            AsyncStorage.getItem("lastPhoto")
                .then((uri) => {
                if (!uri) return

                product.images = [...product.images, { url: uri, description: "", id: 0 }];
                onImagesChange?.(product.images);

                AsyncStorage.removeItem("lastPhoto");
                router.setParams({ photoTaken: "set" });
            });
        }
        // If a photo was set, scroll to the end of the image gallery
        if (photoTaken === "set") {
            imageGallery.current?.scrollToIndex({ index: product.images.length - 1});
            router.setParams({photoTaken: undefined});
        }
    }, [photoTaken]);

    // Callbacks
    const onImageDelete = (imageUrl: string) => {
        product.images = product.images.filter(img => img.url !== imageUrl);
        onImagesChange?.(product.images);
    }

    // Render
    return (
        <View style={{height: 400}}>
            {product.images.length > 0 && (
                <FlatList
                    data={product.images}
                    ref={imageGallery}
                    keyExtractor={(item, index) => index.toString()}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    getItemLayout={(data, index) => (
                        {length: width, offset: width * index, index}
                    )}
                    renderItem={({ item, index }) => (
                        <SingleImage
                            uri={item.url}
                            editMode={editMode}
                            onDelete={onImageDelete}
                            index={index + 1}
                            maxIndex={product.images.length}
                        />
                    )}
                />
            )}
            {product.images.length == 0 && (
                <Image
                    source={{ uri: "https://placehold.co/600x400?text=" + product.name.replace(" ", "+") }}
                    style={{ width: '100%', height: '100%'}}
                    contentFit="cover"/>
            )}
            {editMode && (
                <Pressable
                    style={{
                        position: 'absolute',
                        bottom: 10,
                        right: 10,
                        padding: 8,
                        borderRadius: 12,
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    }}
                    onPress={() => {
                        const params = {id: product.id};
                        router.push({pathname: "/products/[id]/camera", params: params});
                    }
                }
                >
                    <Icon
                        source={"camera"} size={24} color={"white"}
                    />
                </Pressable>
            )}
        </View>
    )}


interface singeImageProps {
    uri: string;
    editMode: boolean;
    index: number;
    maxIndex: number;
    onDelete?: (imageUrl: string) => void;
}


function SingleImage({uri, editMode, index, maxIndex, onDelete}: singeImageProps) {
    const width = Dimensions.get('window').width;

    return (
        <>
            <Image
                source={{ uri: uri }}
                style={{ width: width, height: 400}}
                contentFit="cover"
            />
            <Text
                style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    padding: 6,
                    borderRadius: 12,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: 'white',
                    fontSize: 14,
                }}
            >
                {`${index} / ${maxIndex}`}
            </Text>
            {editMode && (
                <Pressable
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        padding: 8,
                        borderRadius: 12,
                        backgroundColor: 'rgba(160, 0, 0, 0.6)',
                    }}
                    onPress={() => onDelete?.(uri)}
                >
                    <Icon
                        source={"delete"} size={24} color={"white"}
                    />
                </Pressable>

            )}

        </>
    )
}