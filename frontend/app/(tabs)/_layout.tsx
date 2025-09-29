import { Tabs} from "expo-router";

export default function Layout() {
  return (
      <Tabs>
        <Tabs.Screen name="database" options={{title: "Database"}}/>
      </Tabs>
  );
}
