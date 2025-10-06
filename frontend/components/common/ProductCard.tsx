import {Card, Text} from "react-native-paper";
import {useRouter} from "expo-router";

interface Props {
    name: string;
    description?: string;
    id: number | "new";
}

export default function ProductCard({ name, description, id }: Props) {
    // Hooks
    const router = useRouter();

    // Callbacks
    const navigateToProduct = () => {
        const params = {id: id, name: name};
        router.push({pathname: "/products/[id]", params: params});
    }

    // Render
    return (
        <Card onPress={navigateToProduct}>
            <Card.Title title={name}/>
            <Card.Content>
                <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
                    {description || "No description provided."}
                </Text>
            </Card.Content>
        </Card>
    );
}