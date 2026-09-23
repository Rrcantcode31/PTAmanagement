import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, ImageBackground } from "react-native";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import GridNavButton from "./components/GridNavButton";
import {API_URL} from "./_layout";
import { useAuth } from "../appContext/authContext";

export default function profile() {

  const pathname = usePathname();
    const { user } = useAuth();

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
  });

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
    : 'Commuter';

  return (
    <SafeAreaView style={styles.safeArea}>

      <ImageBackground
            source={require('../assets/images/main-bg.png')}
            style={{ flex: 1 }}
            resizeMode="cover"
          >
            <View style={{
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.38)'
      }}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* ===== HEADER ===== */}
        <View style={styles.header}>
          <Text style={styles.welcome}>Comuuter profile</Text>
          <Text style={styles.name}>{displayName}</Text>
        </View>

        {/* ===== LOGOUT ===== */}
        <TouchableOpacity style={styles.logout} onPress={() => router.replace("/")}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

         

      </ScrollView>
     <View style={styles.row}>
        <GridNavButton 
          title="Dashboard" 
          route="/Dashboard" 
          icon="view-dashboard-outline"
        />
        
        <GridNavButton 
          title="Map routes" 
          route="/mapping" 
          icon="map-marker-path"
        />
        
        <GridNavButton 
          title="Fare prices" 
          route="/farePrices" 
          icon="cash-multiple"
        />
        
        <GridNavButton 
          title="Vehicles" 
          route="/vehicle" 
          icon="car"
        />
        
        <GridNavButton 
          title="Profile" 
          route="/profile" 
          icon="account-circle" // ✅ user profile icon
          active={pathname === "/profile"}
        />
      </View>
      </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },

  container: {
    padding: 15,
    flexGrow: 1,
  },
  header: {
    marginBottom: 30,
  },
  welcome: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
  },
  name: {
    fontSize: 15,
    fontFamily: "monster_act",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 0.3,
    borderBottomColor: "#000",
  },

  row: {
    position: "absolute",
    bottom: 25,
    width: "90%", // Extends the bar across the screen width
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderRadius: 24,
    height: 46, // Keeps the slim height
    
    backgroundColor: "rgba(233, 233, 233, 0.64)",
    borderWidth: 0.8,
    borderColor: "rgba(255, 255, 255, 0.25)",

    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
    
  },

  logout: {
    marginTop: 30,
    backgroundColor: "#ff6b6b",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  logoutText: {
    color: "#fff",
    fontFamily: "monster_act",
  },
});