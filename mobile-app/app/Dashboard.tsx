import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, ImageBackground, Dimensions } from "react-native";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import WebView from 'react-native-webview';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from "react";
import GridNavButton from "./components/GridNavButton";
import { useAuth } from "../appContext/authContext";

const { width, height } = Dimensions.get('window');

export default function Dashboard() {
  const pathname = usePathname();
  const { user } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const [locationStatus, setLocationStatus] = useState('Getting location...');

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
    digitalFont: require("../assets/Font/digitalFont.ttf")
  });

  useEffect(() => {
    getLocationAndSendToWebView();
  }, []);

  const getLocationAndSendToWebView = async () => {
    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setLocationStatus('Location permission denied');
        console.log('Location permission denied');
        return;
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      setLocationStatus(`Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      console.log('Got location:', latitude, longitude);

      // Send location to WebView after it loads
      const sendLocationToWebView = () => {
        if (webViewRef.current) {
          const injectScript = `
            (function() {
              console.log('Injecting location: ${latitude}, ${longitude}');
              if (window.setUserLocation) {
                window.setUserLocation(${latitude}, ${longitude});
              } else {
                console.log('setUserLocation not ready yet');
                // Wait for map to be ready
                setTimeout(() => {
                  if (window.setUserLocation) {
                    window.setUserLocation(${latitude}, ${longitude});
                  }
                }, 500);
              }
            })();
            true;
          `;
          webViewRef.current?.injectJavaScript(injectScript);
        }
      };

      // Send immediately and also after a delay
      sendLocationToWebView();
      setTimeout(sendLocationToWebView, 1000);
      
    } catch (error) {
      console.error('Error getting location:', error);
      setLocationStatus('Error getting location');
    }
  };

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
    : 'Commuter';

  const leafletMapHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { margin: 0; padding: 0; overflow: hidden; }
        #map { position: absolute; top: 0; bottom: 0; left: 0; right: 0; }
        .location-status {
          position: absolute;
          bottom: 10px;
          left: 10px;
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 5px 10px;
          border-radius: 5px;
          font-size: 12px;
          z-index: 1000;
          pointer-events: none;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <div id="status" class="location-status">Waiting for location...</div>
      <script>
        let map;
        let userMarker;
        
        // Function to receive location from React Native
        window.setUserLocation = function(latitude, longitude) {
          console.log('Received location in WebView:', latitude, longitude);
          document.getElementById('status').innerHTML = 'Location: ' + latitude.toFixed(4) + ', ' + longitude.toFixed(4);
          
          if (map) {
            // Remove existing marker if any
            if (userMarker) {
              map.removeLayer(userMarker);
            }
            
            // Create custom user location marker
            const userIcon = L.divIcon({
              className: 'user-marker',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
              html: '<div style="width: 30px; height: 30px; background-color: #2196F3; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3); animation: pulse 1.5s infinite;"></div><style>@keyframes pulse {0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); } 100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }}</style>'
            });
            
            userMarker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
            userMarker.bindPopup('<b>Your Location</b><br>You are here!').openPopup();
            map.setView([latitude, longitude], 15);
            
            // Add accuracy circle
            L.circle([latitude, longitude], {
              color: '#2196F3',
              fillColor: '#2196F3',
              fillOpacity: 0.1,
              radius: 50
            }).addTo(map);
          } else {
            console.log('Map not ready yet, waiting...');
            // Try again after a short delay
            setTimeout(function() {
              if (map) {
                window.setUserLocation(latitude, longitude);
              }
            }, 500);
          }
        };
        
        function initMap() {
          console.log('Initializing map...');
          const southCotabatoBounds = L.latLngBounds([[5.95, 124.53], [6.65, 125.4]]);
          map = L.map('map', {
            maxBounds: southCotabatoBounds,
            maxBoundsViscosity: 1.0,
            minZoom: 11,
            maxZoom: 20
          });
          map.fitBounds(southCotabatoBounds, { padding: [10, 10] });
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);
          
          console.log('Map initialized successfully');
          document.getElementById('status').innerHTML = 'Map ready, waiting for location...';
        }
        
        document.addEventListener('DOMContentLoaded', initMap);
      </script>
    </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground source={require('../assets/images/main-bg.png')} style={styles.background} resizeMode="cover">
        <View style={styles.overlay}>
          <View style={styles.headerSection}>
            <View style={styles.header}>
              <Text style={styles.welcome}>Dashboard</Text>
              <Text style={styles.name}>{displayName}</Text>
            </View>
            <View style={styles.cardsRow}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Active Vehicles</Text>
                <Text style={styles.cardValue}>0</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Active Drivers</Text>
                <Text style={styles.cardValue}>0</Text>
              </View>
            </View>
          </View>
          <View style={styles.mapContainer}>
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: leafletMapHTML }}
              style={styles.map}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              geolocationEnabled={true}
              onLoadEnd={() => {
                console.log('WebView loaded, sending location...');
                getLocationAndSendToWebView();
              }}
              onError={(error) => console.log('WebView error:', error)}
            />
          </View>
          <View style={styles.navRow}>
            <GridNavButton title="Dashboard" route="/Dashboard" icon="view-dashboard-outline" active={pathname === "/Dashboard"} />
            <GridNavButton title="Map routes" route="/mapping" icon="map-marker-path" active={pathname === "/mapping"} />
            <GridNavButton title="Fare prices" route="/farePrices" icon="cash-multiple" active={pathname === "/farePrices"} />
            <GridNavButton title="Vehicles" route="/vehicle" icon="car" active={pathname === "/vehicle"} />
            <GridNavButton title="Profile" route="/profile" icon="account-circle" active={pathname === "/profile"} />
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
  background: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: Platform.OS === 'ios' ? 'blur(10px)' : undefined,
  },
  headerSection: {
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 5,
  },
  header: {
    marginBottom: 10,
  },
  welcome: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: '#1e2a3a',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 16,
    fontFamily: "monster_act",
    color: '#2c3e50',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    marginTop: 4,
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 15,
  },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.21)',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(255, 255, 255, 0.21)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(229, 228, 228, 0.56)',
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: "digitalFont",
    color: '#080808',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardValue: {
    fontFamily: "digitalFont",
    fontSize: 40,
    color: '#000000',
  },
  locationStatusText: {
    fontSize: 12,
    fontFamily: "monsterrat_kp",
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  mapContainer: {
    flex: 1,
    width: width,
    backgroundColor: '#f0f0f0',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#ffffff17",
    paddingHorizontal: 5,
    paddingBottom:2,
    height: 50,
    marginTop: 5,
    
  },
});