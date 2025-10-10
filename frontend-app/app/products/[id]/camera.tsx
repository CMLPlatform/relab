import {useRouter, useLocalSearchParams} from "expo-router";
import {useRef, useState} from "react";
import {Pressable, View} from "react-native";
import {CameraView} from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";

type searchParams = {
    id: string;
}

export default function ProductCamera() {
    // Hooks
    const router = useRouter();
    const {id} = useLocalSearchParams<searchParams>();
    const ref = useRef<CameraView>(null);

    // States
    const [ready, setReady] = useState(false)
    const [cameraReady, setCameraReady] = useState(false)

    // Callbacks
    const takePicture = async () => {
        // Take picture
        const photo = await ref.current?.takePictureAsync();
        if (!photo) return;

        // Save photo URI to AsyncStorage
        await AsyncStorage.setItem("lastPhoto", photo.uri);

        // Dismiss and return to product page
        const params = {id: id, photoTaken: "taken"};
        router.dismissTo({pathname: "/products/[id]", params: params});
    };

    // Render
    return (
        <View style={{ flex: 1 }} onLayout={() => setReady(true)}>
            {/*Only render when layouting is done to fix visual bug on Android*/}
            {ready && (
                <CameraView
                    ref={ref}
                    facing="back"
                    style={{flex: 1}}
                    onCameraReady={() => setCameraReady(true)}
                />
            )}

            {/*Only enable taking pictures when camera is actually ready*/}
            {cameraReady && (
                <CameraButton
                    onPress={takePicture}
                />
            )}
        </View>
    );
}


function CameraButton({onPress}: {onPress: () => void}) {
    // Render
    return(
        <Pressable
            onPress={onPress}
            style={{position: 'absolute', bottom: 30, alignSelf: 'center'}}
        >
            {({pressed}) => (
                <View
                    style={{
                        backgroundColor: "transparent",
                        borderWidth: 5,
                        borderColor: "white",
                        width: 85,
                        height: 85,
                        borderRadius: 45,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <View
                        style={{
                            backgroundColor: 'white',
                            width: 70,
                            height: 70,
                            borderRadius: 50,
                            opacity: pressed ? 0.5 : 1,
                        }}
                    />
                </View>
            )}
        </Pressable>
    )
}
