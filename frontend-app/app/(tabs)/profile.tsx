import {useEffect, useState} from "react";
import {IconButton} from "react-native-paper";
import { Text, Chip } from "@/components/base";

import { User } from "@/types/User";
import { getUser, logout } from "@/services/api/authentication";
import {Pressable, View} from "react-native";
import {useRouter} from "expo-router";

export default function ProfileTab() {
    // Hooks
    const router = useRouter();

    // States
    const [profile, setProfile] = useState<User | undefined>(undefined);

    // Effects
    useEffect(() => {
        getUser().then(setProfile);
    }, []);

    // callbacks
    const logoutCallback = () => {
        logout().then(() => {
            setProfile(undefined);
            router.replace("/login");
        });
    }

    // Sub Render >> No profile (not logged in)
    if (!profile) {
        return null
    }

    // Render
    return (
        <View style={{ flex: 1, padding: 20}}>
            <Text
                style={{
                    marginTop: 80,
                    fontSize: 40,
                }}
            >
                {"Hi"}
            </Text>
            <Text
                style={{
                    fontSize: 80,
                    fontWeight: "bold",
                }}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
            >
                {profile.username + "."}
            </Text>
            <View style={{ marginTop: 12, marginBottom: 50, gap: 10, flexDirection: "row", flexWrap: "wrap" }}>
                {profile.isActive ? <Chip>Active</Chip> : <Chip style={{backgroundColor: "lightgrey"}}>Inactive</Chip>}
                {profile.isSuperuser && <Chip>Superuser</Chip>}
                {profile.isVerified ? <Chip>Verified</Chip> : <Chip style={{backgroundColor: "lightgrey"}}>Unverified</Chip>}
            </View>
            {/*<Text variant={"labelSmall"} style={{textAlign: "right"}}>{profile.id}</Text>*/}
            <ProfileAction title={"Logout"} subtitle={"Change to another account"} onPress={logoutCallback} />
            {profile.isVerified || (
                <ProfileAction title={"Verify your email address"} subtitle={"Resend the verification email"} onPress={logoutCallback} />
            )}
        </View>
    )
}

function ProfileAction({onPress, title, subtitle}: {onPress: () => void, title: string, subtitle?: string}){
    return(
        <Pressable
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginVertical: 5
            }}
            onPress={onPress}
        >
            <View style={{flexDirection: "column"}}>
                <Text
                    style={{
                        flex: 1,
                        marginRight: 10,
                        fontSize: 18,
                        fontWeight: "bold",
                    }}
                >
                    {title}
                </Text>
                <Text
                    style={{
                        flex: 1,
                        marginRight: 10,
                        fontSize: 15,
                    }}
                >
                    {subtitle}
                </Text>
            </View>
            <IconButton
                icon="chevron-right"
                size={30}
                onPress={onPress}
            />
        </Pressable>
    )
}
