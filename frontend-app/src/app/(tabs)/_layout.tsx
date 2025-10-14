import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function Layout() {
  return (
      <Tabs>
        <Tabs.Screen
            name="products"
            options={{
                title: "Products Database",
                headerShown: false,
                tabBarIcon: ({ color, size }) => (
                    <MaterialCommunityIcons name="database" color={color} size={size} />
                ),
            }}
        />
          <Tabs.Screen
              name="profile"
              options={{
                  title: "Profile",
                  headerShown: false,
                  tabBarIcon: ({ color, size }) => (
                      <MaterialCommunityIcons name="account" color={color} size={size} />
                  ),
              }}
          />
      </Tabs>
  );
}
