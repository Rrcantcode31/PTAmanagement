import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform, StatusBar, ImageBackground } from "react-native";
import MapView, { UrlTile, Marker } from "react-native-maps";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import GridNavButton from "./components/GridNavButton";
import axios from "axios";
import {API_URL} from "./_layout";

export default function mapping() {

  const pathname = usePathname();
  
  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={{ 
      flex: 1, 
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, 
    }}>

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
          <Text style={styles.welcome}>South Cotabato Terminal - locations</Text>
        </View>

<View style={styles.mapContainer}>
        <MapView
        style={styles.map}
        initialRegion={{
          latitude: 6.1164,      // Example: Koronadal City
          longitude: 125.1716,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* OpenStreetMap Tiles */}
        <UrlTile
          urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        {/* Example Marker */}
        <Marker
          coordinate={{ latitude: 6.1164, longitude: 125.1716 }}
          title="Koronadal Terminal"
          description="Main Terminal Location"
        />
      </MapView>
</View>

      </ScrollView>
      <View style={styles.row}>
         <GridNavButton 
           title="Dashboard" 
           route="/Dashboard" 
           icon="view-dashboard-outline" // ✅ MaterialCommunityIcons dashboard icon
           active={pathname === "/Dashboard"}
         />
         
         <GridNavButton 
           title="Map routes" 
           route="/mapping" 
           icon="map-marker-path" // ✅ shows route/path
           active={pathname === "/mapping"}
         />
         
         <GridNavButton 
           title="Fare prices" 
           route="/farePrices" 
           icon="cash-multiple" // ✅ multiple cash bills
           active={pathname === "/farePrices"}
         />
         
         <GridNavButton 
           title="Vehicles" 
           route="/vehicle" 
           icon="car" // ✅ vehicle icon
           active={pathname === "/vehicle"}
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

  mapContainer: {
    height: 400,
    borderRadius: 15,
    overflow: "hidden",
    marginBottom: 20,
  },
  map: {
    flex: 1,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#ffffff17",
    paddingHorizontal: 5,
    paddingBottom:2,
    height: 50,
    marginTop: 5,
  },

});