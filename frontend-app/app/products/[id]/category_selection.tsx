import {useLocalSearchParams, useRouter} from "expo-router";
import {useState} from "react";
import {Icon, Searchbar} from 'react-native-paper';
import {FlatList, View, Pressable, StyleSheet, useColorScheme, Text} from "react-native";


import CPVCard from "@/components/common/CPVCard";

import {CPVCategory} from "@/types/CPVCategory";

import cpvJSON from '@/assets/data/cpv.json';
import LightTheme from "@/assets/themes/light";
import DarkTheme from "@/assets/themes/dark";

const cpv = cpvJSON as Record<string, CPVCategory>


type searchParams = {
    id: string;
}

export default function CategorySelection() {
    // Hooks
    const router = useRouter();
    const { id } = useLocalSearchParams<searchParams>();

    // States
    const [searchQuery, setSearchQuery] = useState("");
    const [cpvClass, setCpvClass] = useState(cpv["root"]);
    const [history, setHistory] = useState<CPVCategory[]>([cpv["root"]]);

    // Callbacks
    const selectedBranch = (item: CPVCategory) => {
        setHistory([...history, item]);
        setCpvClass(item);
    }

    const moveUp = () => {
        const newHistory = [...history];
        newHistory.pop();
        setHistory(newHistory);
        setCpvClass(newHistory[newHistory.length - 1]);
    }

    const typeSelected = function(selectedTypeID: number){
        const params = {id: id, typeSelection: selectedTypeID};
        router.dismissTo({pathname: "/products/[id]", params: params});
    }

    // Methods
    const filteredCPV = (): CPVCategory[] => {
        if (!searchQuery) {
            return cpvClass.directChildren.map(id => cpv[id]);
        }

        const unfiltered = cpvClass.allChildren.map(id => cpv[id]);
        return unfiltered.filter(item =>
            item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }

    // Render
    return (
        <View style={{flex: 1}}>
            <Searchbar
                style={{ position: "absolute", top: 15, left: 15, right: 15, zIndex: 1}}
                placeholder="Search"
                onChangeText={setSearchQuery}
                value={searchQuery}
            />
            {history.length > 1 && (
                <CPVHistory history={history} onPress={moveUp} />
            )}
            <FlatList
                contentContainerStyle={{
                    gap: 15,
                    padding: 15,
                    paddingTop: history.length > 1 ? 152 : 85,
                    marginBottom: 20
                }}
                data={filteredCPV()}
                renderItem={({ item }) => (
                    <View>
                        <CPVCard
                            CPV={item}
                            onPress={() => {typeSelected(item.id)}}
                            actionElement={<CPVLink CPV={item} onPress={()=> selectedBranch(item)} />}
                        />
                    </View>
                )}
            />
        </View>
    );
}

function CPVHistory({history, onPress}: {history: CPVCategory[], onPress?: () => void}) {
    const darkMode = useColorScheme() === "dark";
    return (
        <Pressable
            style={[
                styles.historyContainer,
                darkMode ? styles.historyContainerDark : null,
            ]}
            onPress={onPress}
        >
            <Icon
                size={20}
                source={"chevron-left"}
                color={darkMode ? DarkTheme.colors.onTertiaryContainer : LightTheme.colors.onTertiaryContainer}
            />
            <Text
                numberOfLines={2}
                lineBreakMode={"tail"}
                style={[
                    styles.historyText,
                    darkMode ? styles.historyTextDark : null,
                ]}
            >
                {history[history.length - 1].description}
            </Text>
        </Pressable>
    )
}

function CPVLink({CPV, onPress}: {CPV: CPVCategory, onPress?: () => void}) {
    const darkMode = useColorScheme() === "dark";

    if (CPV.directChildren.length <= 0) {
        return <View style={{height: 30}}/>
    }

    return (
        <Pressable
            style={[
                styles.linkContainer,
                darkMode ? styles.linkContainerDark : null,
            ]}
            onPress={onPress}
        >
            <Text
                style={[
                    styles.linkText,
                    darkMode ? styles.linkTextDark : null,
                ]}
            >
                {`${CPV.directChildren.length} subcategories`}
            </Text>
            <Icon
                size={20}
                source={"chevron-right"}
                color={darkMode ? DarkTheme.colors.onSecondaryContainer : LightTheme.colors.onSecondaryContainer}
            />
        </Pressable>
    )
}

const styles = StyleSheet.create({
    linkContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 5,
        height: 30,
        paddingHorizontal: 12,
        backgroundColor: LightTheme.colors.secondaryContainer,
    },
    linkContainerDark: {
        backgroundColor: DarkTheme.colors.secondaryContainer,
    },
    linkText: {
        color: LightTheme.colors.onSecondaryContainer,
        fontSize: 14,
        textAlign: "right",
    },
    linkTextDark: {
        color: DarkTheme.colors.onSecondaryContainer,
    },

    historyContainer: {
        position: "absolute",
        flexDirection: "row",
        gap: 10,
        padding: 10,
        height: 60,
        alignItems: "center",
        top: 80,
        left: 15,
        right: 15,
        zIndex: 1,
        borderRadius: 5,
        backgroundColor: LightTheme.colors.tertiaryContainer,
        boxShadow: '3px 3px 3px rgba(0, 0, 0, 0.2)',
    },
    historyContainerDark: {
        backgroundColor: DarkTheme.colors.tertiaryContainer,
    },
    historyText: {
        color: LightTheme.colors.onTertiaryContainer,
    },
    historyTextDark: {
        color: DarkTheme.colors.onTertiaryContainer
    }

});

