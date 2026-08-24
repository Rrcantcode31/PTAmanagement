import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, ImageBackground, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import GridNavButton from "../components/GridNavButton";
import { API_URL } from "../_layout";

type QueueItem = {
  id: string;
  plateNumber: string;
  driverName: string;
  vehicleType: string;
  queuePosition: number;
  status: string;
};

export default function driverQueue() {
  const pathname = usePathname();

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../../assets/Font/monster_act.ttf"),
    digitalFont: require("../../assets/Font/digitalFont.ttf")
  });

  if (!fontsLoaded) return null;

  // Hardcoded queue data – removed avatar URLs
  const queueData: QueueItem[] = [
    {
      id: "1",
      plateNumber: "KGA-1234",
      driverName: "Ramon Dela Cruz",
      vehicleType: "Van",
      queuePosition: 1,
      status: "Ready",
    },
    {
      id: "2",
      plateNumber: "KGA-5678",
      driverName: "Maria Santos",
      vehicleType: "Van",
      queuePosition: 2,
      status: "Boarding",
    },
    {
      id: "3",
      plateNumber: "KGA-9101",
      driverName: "Jake Sarmiento",
      vehicleType: "Minibus",
      queuePosition: 3,
      status: "Waiting",
    },
    {
      id: "4",
      plateNumber: "KGA-1122",
      driverName: "Luzviminda Ortigas",
      vehicleType: "Van",
      queuePosition: 4,
      status: "On Standby",
    },
    {
      id: "5",
      plateNumber: "KGA-3344",
      driverName: "Edwin Magbanua",
      vehicleType: "Modern Jeep",
      queuePosition: 5,
      status: "Delayed",
    },
  ];

  const renderQueueItem = ({ item }: { item: QueueItem }) => (
    <View style={styles.queueCard}>
      {/* Default avatar: no face, just a silhouette icon */}
      <View style={styles.avatarPlaceholder}>
        <Ionicons name="person-outline" size={32} color="#5c7e76" />
      </View>

      <View style={styles.cardMiddle}>
        <Text style={styles.plateNumber}>{item.plateNumber}</Text>
        <Text style={styles.driverName}>Driver: {item.driverName}</Text>
        <Text style={styles.vehicleType}>{item.vehicleType}</Text>
      </View>

      <View style={styles.cardRight}>
        <View style={styles.queueBadge}>
          <Text style={styles.queuePosition}>#{item.queuePosition}</Text>
        </View>
        <Text
          style={[
            styles.status,
            item.status === "Ready" ? styles.statusReady : styles.statusOther,
          ]}
        >
          {item.status}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={{
        flex: 1,
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
      }}
    >
      <ImageBackground
        source={require("../../assets/images/main-bg.png")}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(255, 255, 255, 0.38)",
          }}
        >
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.header}>
              <Text style={styles.welcome}>Vehicle Queueing</Text>
              <Text style={styles.routeText}>
                Route: Koronadal City ↔ Banga (Vice-versa)
              </Text>
              <Text style={styles.subText}>
                Current queue order – first come, first serve
              </Text>
            </View>

            <FlatList
              data={queueData}
              keyExtractor={(item) => item.id}
              renderItem={renderQueueItem}
              scrollEnabled={false}
              contentContainerStyle={styles.queueList}
            />
          </ScrollView>

          <View style={styles.row}>
            <GridNavButton
              title="Dashboard"
              route="./driverDashboard"
              icon="view-dashboard-outline"
            />
            <GridNavButton
              title="Map routes"
              route="./driverRoute"
              icon="map-marker-path"
            />
            <GridNavButton
              title="Fare prices"
              route="./driverFareprices"
              icon="cash-multiple"
            />
            <GridNavButton
              title="Vehicles"
              route="./driverQueue"
              icon="van-passenger"
              active={pathname === "/driverApp/driverQueue"}
            />
            <GridNavButton
              title="Profile"
              route="./driverProfile"
              icon="account-circle"
            />
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 15,
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 24,
  },
  welcome: {
    fontSize: 22,
    fontFamily: "monsterrat_kp",
    color: "#000000",
    marginBottom: 6,
  },
  routeText: {
    fontSize: 16,
    fontFamily: "monster_act",
    color: "#000000",
    marginBottom: 4,
  },
  subText: {
    fontSize: 13,
    fontFamily: "monster_act",
    color: "#000000",
    borderBottomWidth: 0.5,
    borderBottomColor: "#181818",
    paddingBottom: 10,
  },
  queueList: {
    gap: 14,
  },
  queueCard: {
    flexDirection: "row",
    backgroundColor: "#ffffffcc",
    borderRadius: 20,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#d9eae6",
  },
  avatarPlaceholder: {
    width: 55,
    height: 55,
    borderRadius: 30,
    backgroundColor: "#e6f0ed",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    borderWidth: 1,
    borderColor: "#c8e0da",
  },
  cardMiddle: {
    flex: 2,
  },
  plateNumber: {
    fontSize: 20,
    fontFamily: "digitalFont",
    color: "#2c7a6e",
    marginBottom: 4,
  },
  driverName: {
    fontSize: 13,
    fontFamily: "monster_act",
    color: "#000000",
    marginBottom: 2,
  },
  vehicleType: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#7f9f97",
  },
  cardRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
  },
  queueBadge: {
    backgroundColor: "#2c7a6e",
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  queuePosition: {
    color: "white",
    fontSize: 14,
    fontFamily: "monsterrat_kp",
    fontWeight: "bold",
  },
  status: {
    fontSize: 11,
    fontFamily: "monsterrat_font",
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: "hidden",
  },
  statusReady: {
    backgroundColor: "#e0f2e9",
    color: "#1e6f4c",
  },
  statusOther: {
    backgroundColor: "#fff0db",
    color: "#c97e00",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#ffffff17",
    paddingHorizontal: 5,
    paddingBottom: 2,
    height: 50,
    marginTop: 5,
  },
});