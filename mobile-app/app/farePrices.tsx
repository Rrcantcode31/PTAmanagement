import { View, Text, StyleSheet, SafeAreaView, ScrollView, ImageBackground, Platform, StatusBar} from "react-native";
import GridNavButton from "./components/GridNavButton";
import { useFonts } from "expo-font";
import { BlurView } from 'expo-blur';
import { router, usePathname } from "expo-router";
import { useState } from "react";
import {API_URL} from "./_layout";


export default function FarePrices() {

  const pathname = usePathname();


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
        <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.38)' }}>

          {/* SCROLLABLE CONTENT */}
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.header}>
              <Text style={styles.welcome}>Fare prices</Text>
            </View>
            
            <BlurView
  intensity={40}
  tint="light"
  style={styles.FareContainer}
>
  <ScrollView 
    horizontal={true} 
    showsHorizontalScrollIndicator={false}
  >
    {/* 1. WRAP EVERYTHING IN ONE VIEW HERE */}
    <View style={{ width: 500, paddingRight: 10 }}> 
      
      <Text style={styles.TextHeader}>Public Terminal Fare Prices</Text>
      <View style={[styles.headerRow, {paddingRight: 40}]}>
        <Text style={styles.currentHeader}>Current fare:</Text>
        <Text style={styles.tradHeader}>Traditional UVE ₱ 2.40/KM</Text>
        <Text style={styles.ModHeader}>Modernize UVE ₱ 2.50/KM</Text>
      </View>

      <View style={[styles.secHeaderRow, {paddingRight: 40}]}>
        <Text style={styles.routeHeader}>ROUTE FROM</Text>
        <Text style={styles.viseHeader}>TO: VICE VERSA</Text>
        <Text style={styles.kmHeader}>NO. OF KM</Text>
        <Text style={styles.fareTradHeader}>REGULAR FARE(UV-EXPRESS AIRCON)</Text>
        <Text style={styles.discTradHeader}>STUDENT/SC/PWD's</Text>
        <Text style={styles.fareModHeader}>REGULAR FARE(UV-EXPRESS AIRCON)</Text>
        <Text style={styles.discModdHeader}>STUDENT/SC/PWD's</Text>
      </View>
      
    </View> 
  </ScrollView>
</BlurView> 

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
    flexGrow: 1,
  },

  header: {
    padding: 15,
  },
  
  welcome: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
  },

  FareContainer: {
  borderRadius: 20,
  overflow: 'hidden',

  backgroundColor: 'rgba(255, 255, 255, 0.03)',

  borderWidth: .3,
  borderColor: 'rgb(240, 233, 233)',

  margin: 5,
  padding: 5,
  height: 600,

  shadowColor: '#f9f9f956',
  shadowOffset: {
    width: 0,
    height: 0,
  },
  shadowOpacity: 0.35,
  shadowRadius: 10,

  elevation: 10,
  
},

  TextHeader: {
    color: '#319086',
    fontSize: 14,
    padding: 8,
    fontFamily: "monsterrat_kp",
    
  },

  headerRow: {
    borderBottomWidth: 0.3,
    borderBottomColor: "#000",
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 5,
    textAlign: 'left',
  },

  currentHeader: {
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'center',
    width: '40%',
    borderRightWidth: .3
  },

  tradHeader: {
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'center',
    width: '38.33%',
    borderRightWidth: .3
  },

  ModHeader: {
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '40%',
    borderRightWidth: .3
  },

  secHeaderRow: {
    borderBottomWidth: 0.3,
    borderBottomColor: "#000",
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 5,
    textAlign: 'left',
    
  },

  routeHeader:{
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '15%',
    borderRightWidth: .3
  },

  viseHeader:{
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '15%',
    borderRightWidth: .3
       },

  kmHeader:{
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '15%',
    borderRightWidth: .3
        },

  fareTradHeader:{
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '15%',
    borderRightWidth: .3
        },

  discTradHeader:{
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '15%',
    borderRightWidth: .3

        },

fareModHeader:{
  fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '15%',
    borderRightWidth: .3
        },

discModdHeader:{
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: '15%',
    borderRightWidth: .3
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