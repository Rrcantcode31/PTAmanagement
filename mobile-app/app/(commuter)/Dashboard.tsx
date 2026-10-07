import {
  View, Text, StyleSheet, ImageBackground, Dimensions,
  ActivityIndicator, TouchableOpacity, Modal, FlatList, ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { usePathname } from "expo-router";
import WebView from "react-native-webview";
import { BlurView, BlurTargetView } from "expo-blur";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";

const { width, height } = Dimensions.get("window");

const HUB_TERMINAL_ID = 1;

type Terminal = {
  terminal_id: number;
  terminal_name: string;
  terminal_address: string;
  latitude: number;
  longitude: number;
};

type FareRow = {
  bounds_id: number;
  kilometer: number;
  regular_t: number;
  discounted_t: number;
  regular_m: number;
  discounted_m: number;
};

type RouteResult = {
  distance_km: number;
  duration_min: number;
  coords: [number, number][];
};

type Stop = {
  lat: number;
  lng: number;
  name: string;
  isTerminal: boolean;
  terminal_id?: number;
  isHub?: boolean;
};

type TripLeg = {
  from: Stop;
  to: Stop;
  route: RouteResult;
  fare: FareRow | null;
};

type TripPlan = {
  stops: Stop[];
  legs: TripLeg[];
};

type MapType = "street" | "satellite";

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

async function fetchRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RouteResult | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = await res.json();

  const route = data.routes?.[0];
  if (!route) return null;

  return {
    distance_km: route.distance / 1000,
    duration_min: route.duration / 60,
    coords: route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] as [number, number]
    ),
  };
}

function findNearest(list: Terminal[], lat: number, lng: number): Terminal | null {
  let best: Terminal | null = null;
  let bestD = Infinity;
  for (const t of list) {
    const d = (t.latitude - lat) ** 2 + (t.longitude - lng) ** 2;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

export default function Dashboard() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const mapTargetRef = useRef(null);

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [destination, setDestination] = useState<Terminal | null>(null);
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mapType, setMapType] = useState<MapType>("street");

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../../assets/Font/monster_act.ttf"),
    digitalFont: require("../../assets/Font/digitalFont.ttf"),
  });

  // ============================================================
  // Responsive positioning
  // ============================================================
  // Bottom nav sits above the OS navigation zone:
  //   iOS home indicator   → insets.bottom ≈ 34
  //   Android 3-button nav → insets.bottom ≈ 48
  //   Android gesture nav  → insets.bottom ≈ 0
  // We add 12px of breathing room on top of the system inset.
  const navBottomOffset = Math.max(insets.bottom, 8) + 12;

  // EFFECT 1 — Get GPS
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;

        const { latitude, longitude } = loc.coords;
        setMyLocation({ lat: latitude, lng: longitude });

        webViewRef.current?.injectJavaScript(`
          if (window.setUserLocation) {
            window.setUserLocation(${latitude}, ${longitude});
          } else {
            setTimeout(() => window.setUserLocation?.(${latitude}, ${longitude}), 800);
          }
          true;
        `);
      } catch (err) {
        console.warn("[dashboard] location failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // EFFECT 2 — Load all terminals
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/getTerminalsLocation`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        setTerminals(json.terminals || []);
      } catch (err) {
        console.error("[dashboard] terminals load failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // EFFECT 3 — Build the trip plan (hub-and-spoke)
  useEffect(() => {
    if (!myLocation || !destination || terminals.length === 0 || !token) {
      setTripPlan(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingTrip(true);

        const userStop: Stop = {
          lat: myLocation.lat,
          lng: myLocation.lng,
          name: "Your location",
          isTerminal: false,
        };

        const userNearest = findNearest(terminals, myLocation.lat, myLocation.lng);
        const hub = terminals.find((t) => t.terminal_id === HUB_TERMINAL_ID) || null;

        const nearestStop: Stop | null = userNearest
          ? {
              lat: userNearest.latitude,
              lng: userNearest.longitude,
              name: userNearest.terminal_name,
              isTerminal: true,
              terminal_id: userNearest.terminal_id,
            }
          : null;

        const hubStop: Stop | null = hub
          ? {
              lat: hub.latitude,
              lng: hub.longitude,
              name: hub.terminal_name,
              isTerminal: true,
              terminal_id: hub.terminal_id,
              isHub: true,
            }
          : null;

        const destStop: Stop = {
          lat: destination.latitude,
          lng: destination.longitude,
          name: destination.terminal_name,
          isTerminal: true,
          terminal_id: destination.terminal_id,
          isHub: destination.terminal_id === HUB_TERMINAL_ID,
        };

        const stops: Stop[] = [userStop];

        if (!nearestStop) {
          stops.push(destStop);
        } else if (nearestStop.terminal_id === destination.terminal_id) {
          stops.push(destStop);
        } else if (!hubStop) {
          stops.push(nearestStop);
          stops.push(destStop);
        } else if (nearestStop.terminal_id === HUB_TERMINAL_ID) {
          stops.push(hubStop);
          stops.push(destStop);
        } else if (destination.terminal_id === HUB_TERMINAL_ID) {
          stops.push(nearestStop);
          stops.push(hubStop);
        } else {
          stops.push(nearestStop);
          stops.push(hubStop);
          stops.push(destStop);
        }

        const legPromises = stops.slice(0, -1).map((from, i) => {
          const to = stops[i + 1];
          return (async (): Promise<TripLeg | null> => {
            try {
              const route = await fetchRoute(from.lat, from.lng, to.lat, to.lng);
              if (!route) return null;
              return { from, to, route, fare: null };
            } catch (e) {
              console.warn("[dashboard] leg fetch failed:", e);
              return null;
            }
          })();
        });

        const rawLegs = await Promise.all(legPromises);
        const legs = rawLegs.filter((l): l is TripLeg => l !== null);

        if (legs.length === 0) throw new Error("No routes available");

        await Promise.all(
          legs.map(async (leg) => {
            if (!leg.from.terminal_id || !leg.to.terminal_id) return;
            try {
              const res = await fetch(
                `${API_URL}/api/auth/tripEstimate` +
                `?from_terminal_id=${leg.from.terminal_id}` +
                `&to_terminal_id=${leg.to.terminal_id}`,
                { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }
              );
              const json = await res.json();
              if (json.success) leg.fare = json.data?.fare ?? null;
            } catch (e) {
              console.warn("[dashboard] fare fetch failed:", e);
            }
          })
        );

        if (cancelled) return;
        setTripPlan({ stops, legs });
      } catch (err) {
        console.error("[dashboard] trip plan failed:", err);
        if (!cancelled) setTripPlan(null);
      } finally {
        if (!cancelled) setLoadingTrip(false);
      }
    })();

    return () => { cancelled = true; };
  }, [myLocation, destination, terminals, token]);

  // EFFECT 4 — Push trip to the map
  useEffect(() => {
    if (!webViewRef.current) return;

    const stops = tripPlan?.stops ?? [];
    const legs = tripPlan?.legs ?? [];

    if (stops.length > 0 && legs.length > 0) {
      const payload = {
        terminalStops: stops
          .filter((s) => s.isTerminal)
          .map((s) => ({
            lat: s.lat,
            lng: s.lng,
            name: s.name,
            isDestination: s.terminal_id === destination?.terminal_id,
            isHub: s.terminal_id === HUB_TERMINAL_ID,
          })),
        legs: legs.map((leg) => ({ coords: leg.route.coords })),
      };

      webViewRef.current.injectJavaScript(`
        window.drawTrip?.(${JSON.stringify(payload)});
        true;
      `);
    } else {
      webViewRef.current.injectJavaScript(`
        window.clearTrip?.();
        true;
      `);
    }
  }, [tripPlan, destination]);

  // EFFECT 5 — Push map type changes
  useEffect(() => {
    webViewRef.current?.injectJavaScript(`
      window.setMapType?.("${mapType}");
      true;
    `);
  }, [mapType]);

  useEffect(() => {
    if (!destination) setDetailsOpen(false);
  }, [destination]);

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Commuter"
    : "Commuter";

  const safeLegs = tripPlan && Array.isArray(tripPlan.legs) ? tripPlan.legs : [];

  const fareLegs = safeLegs.filter((l) => l.fare);
  const totalRegularT = fareLegs.reduce((s, l) => s + (l.fare?.regular_t ?? 0), 0);
  const totalRegularM = fareLegs.reduce((s, l) => s + (l.fare?.regular_m ?? 0), 0);
  const totalDiscountedT = fareLegs.reduce((s, l) => s + (l.fare?.discounted_t ?? 0), 0);
  const totalDiscountedM = fareLegs.reduce((s, l) => s + (l.fare?.discounted_m ?? 0), 0);

  const totalDistance = safeLegs.reduce((s, l) => s + l.route.distance_km, 0);
  const totalDuration = safeLegs.reduce((s, l) => s + l.route.duration_min, 0);
  const fareLow = fareLegs.length > 0
    ? fareLegs.reduce((s, l) => s + Math.min(l.fare!.regular_t, l.fare!.regular_m), 0)
    : 0;
  const fareHigh = fareLegs.length > 0
    ? fareLegs.reduce((s, l) => s + Math.max(l.fare!.regular_t, l.fare!.regular_m), 0)
    : 0;

  const peso = (v: number | undefined | null) =>
    v == null ? "—" : `₱${Number(v).toFixed(2)}`;

  const fmtKm = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

  const fmtMin = (m: number) =>
    m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;

  const tripActive = !!destination;

  const legBadgeStyle = (idx: number, total: number) => {
    if (idx === 0) return styles.legBadgeFirst;
    if (idx === total - 1) return styles.legBadgeLast;
    return styles.legBadgeMid;
  };

  const toggleMapType = () => {
    setMapType((prev) => (prev === "street" ? "satellite" : "street"));
  };

  // Leaflet HTML — supports street + satellite, no attribution, no zoom buttons
  const leafletMapHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; overflow: hidden; }
        #map { position: absolute; inset: 0; background: #e9efe9; }

        .leaflet-control-zoom,
        .leaflet-control-attribution {
          display: none !important;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        let map = null;
        let userMarker = null;
        let accuracyCircle = null;
        let tripLayers = [];
        let tripMarkers = [];

        // Tile layers (only one is attached at a time)
        let streetLayer = null;
        let satelliteLayer = null;

        const STREET_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

        function makeStreetLayer() {
          return L.tileLayer(STREET_URL, { maxZoom: 19 });
        }

        function makeSatelliteLayer() {
          return L.tileLayer(SATELLITE_URL, { maxZoom: 19 });
        }

        // Public: swap base layer
        window.setMapType = function (type) {
          if (!map) {
            setTimeout(function () { window.setMapType(type); }, 400);
            return;
          }

          if (type === 'satellite') {
            if (streetLayer) { map.removeLayer(streetLayer); streetLayer = null; }
            if (!satelliteLayer) { satelliteLayer = makeSatelliteLayer(); }
            satelliteLayer.addTo(map);
          } else {
            if (satelliteLayer) { map.removeLayer(satelliteLayer); satelliteLayer = null; }
            if (!streetLayer) { streetLayer = makeStreetLayer(); }
            streetLayer.addTo(map);
          }
        };

        window.setUserLocation = function (latitude, longitude) {
          if (!map) {
            setTimeout(function () { window.setUserLocation(latitude, longitude); }, 400);
            return;
          }

          if (userMarker) map.removeLayer(userMarker);
          if (accuracyCircle) map.removeLayer(accuracyCircle);

          const userIcon = L.divIcon({
            className: '',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            html:
              '<div style="position:relative;">' +
                '<div style="width:30px;height:30px;background:#2196F3;' +
                  'border:3px solid white;border-radius:50%;' +
                  'box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>' +
                '<div style="position:absolute;inset:-6px;border-radius:50%;' +
                  'background:rgba(33,150,243,0.25);animation:pulse 1.6s infinite;"></div>' +
              '</div>' +
              '<style>@keyframes pulse{0%{transform:scale(.9);opacity:.7}' +
              '70%{transform:scale(1.4);opacity:0}100%{transform:scale(.9);opacity:0}}</style>'
          });

          userMarker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
          userMarker.bindPopup('<b>Your location</b>');
          accuracyCircle = L.circle([latitude, longitude], {
            color: '#2196F3', fillColor: '#2196F3', fillOpacity: 0.1, radius: 50,
          }).addTo(map);

          map.setView([latitude, longitude], 14);
        };

        function clearTripLayers() {
          tripLayers.forEach(function (l) { map.removeLayer(l); });
          tripMarkers.forEach(function (m) { map.removeLayer(m); });
          tripLayers = [];
          tripMarkers = [];
        }

        window.clearTrip = function () {
          if (!map) return;
          clearTripLayers();
        };

        window.drawTrip = function (data) {
          if (!map) {
            setTimeout(function () { window.drawTrip(data); }, 400);
            return;
          }

          clearTripLayers();

          const LEG_COLORS = ['#2196F3', '#f39c12', '#e74c3c', '#9b59b6'];
          const allCoords = [];

          data.legs.forEach(function (leg, idx) {
            const color = LEG_COLORS[Math.min(idx, LEG_COLORS.length - 1)];
            const isFirst = idx === 0;
            const line = L.polyline(leg.coords, {
              color: color,
              weight: isFirst ? 4 : 5,
              opacity: 0.9,
              dashArray: isFirst ? '8 6' : null,
              lineJoin: 'round',
            }).addTo(map);
            tripLayers.push(line);
            allCoords.push.apply(allCoords, leg.coords);
          });

          data.terminalStops.forEach(function (stop) {
            if (stop.isDestination) {
              const destIcon = L.divIcon({
                className: '',
                iconSize: [28, 40],
                iconAnchor: [14, 40],
                popupAnchor: [0, -36],
                html:
                  '<svg viewBox="0 0 24 36" width="28" height="40" xmlns="http://www.w3.org/2000/svg">' +
                    '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 24 12 24s12-15.6 12-24C24 5.4 18.6 0 12 0z" ' +
                    'fill="#D85A30" stroke="#fff" stroke-width="2"/>' +
                    '<circle cx="12" cy="12" r="4.5" fill="#fff"/>' +
                  '</svg>',
              });
              const m = L.marker([stop.lat, stop.lng], { icon: destIcon })
                .addTo(map)
                .bindPopup('<b>' + stop.name + '</b><br>Destination');
              tripMarkers.push(m);
            } else {
              const busIcon = L.divIcon({
                className: '',
                iconSize: [26, 26],
                iconAnchor: [13, 13],
                popupAnchor: [0, -16],
                html:
                  '<div style="width:26px;height:26px;background:' + (stop.isHub ? '#2c7a6e' : '#16a085') + ';' +
                    'border:3px solid white;border-radius:50%;' +
                    'box-shadow:0 2px 6px rgba(0,0,0,0.3);' +
                    'display:flex;align-items:center;justify-content:center;">' +
                    '<svg viewBox="0 0 24 24" width="14" height="14" fill="white">' +
                      '<path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>' +
                    '</svg>' +
                  '</div>',
              });
              const label = stop.isHub ? ' (Hub)' : '';
              const m = L.marker([stop.lat, stop.lng], { icon: busIcon })
                .addTo(map)
                .bindPopup('<b>' + stop.name + '</b>' + label + '<br>Ride continues here');
              tripMarkers.push(m);
            }
          });

          if (allCoords.length > 0) {
            map.fitBounds(L.latLngBounds(allCoords), { padding: [70, 70] });
          }
        };

        function initMap() {
          const b = L.latLngBounds([[5.95, 124.53], [6.65, 125.4]]);
          map = L.map('map', {
            zoomControl: false,
            attributionControl: false,
            maxBounds: b,
            maxBoundsViscosity: 1.0,
            minZoom: 11,
            maxZoom: 20,
          });
          map.fitBounds(b, { padding: [10, 10] });

          // Start with street tiles
          streetLayer = makeStreetLayer();
          streetLayer.addTo(map);
        }
        document.addEventListener('DOMContentLoaded', initMap);
      </script>
    </body>
    </html>
  `;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ImageBackground
        source={require("../../assets/images/main-bg.png")}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay}>

          {/* ===== FULL-SCREEN MAP ===== */}
          <BlurTargetView ref={mapTargetRef} style={StyleSheet.absoluteFill}>
            <WebView
              ref={webViewRef}
              originWhitelist={["*"]}
              source={{ html: leafletMapHTML }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              geolocationEnabled
              onLoadEnd={() => {
                // Restore user location
                if (myLocation) {
                  webViewRef.current?.injectJavaScript(`
                    window.setUserLocation?.(${myLocation.lat}, ${myLocation.lng});
                    true;
                  `);
                }

                // Restore map type
                webViewRef.current?.injectJavaScript(`
                  window.setMapType?.("${mapType}");
                  true;
                `);

                // Restore trip
                const stops = tripPlan?.stops ?? [];
                const legs = tripPlan?.legs ?? [];

                if (stops.length > 0 && legs.length > 0) {
                  const payload = {
                    terminalStops: stops
                      .filter((s) => s.isTerminal)
                      .map((s) => ({
                        lat: s.lat,
                        lng: s.lng,
                        name: s.name,
                        isDestination: s.terminal_id === destination?.terminal_id,
                        isHub: s.terminal_id === HUB_TERMINAL_ID,
                      })),
                    legs: legs.map((leg) => ({ coords: leg.route.coords })),
                  };
                  webViewRef.current?.injectJavaScript(`
                    window.drawTrip?.(${JSON.stringify(payload)});
                    true;
                  `);
                }
              }}
            />
          </BlurTargetView>

          {/* ===== HEADER CARD ===== */}
          <View style={styles.headerCard}>
            <Text style={styles.welcome}>Dashboard</Text>
            <Text style={styles.greeting} numberOfLines={1}>
              {greetingText()}, {displayName}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.mapToggle,
              { bottom: navBottomOffset + 68 },
            ]}
            onPress={toggleMapType}
            activeOpacity={0.85}
            accessibilityLabel={
              mapType === "satellite" ? "Switch to street view" : "Switch to satellite view"
            }
          >
            <BlurView intensity={40} tint="light" style={styles.mapToggleBlur}>
              <Ionicons
                name={mapType === "satellite" ? "map-outline" : "earth-outline"}
                size={18}
                color="#1f6f66"
              />
            </BlurView>
          </TouchableOpacity>

          {/* ===== FIELD CARD ===== */}
          <View style={styles.fieldCard}>

            <TouchableOpacity
              style={styles.field}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="navigate" size={15} color="#D85A30" />
              <Text style={styles.fieldText} numberOfLines={1}>
                {destination ? destination.terminal_name : "Where to?"}
              </Text>
              {destination ? (
                <TouchableOpacity
                  onPress={() => setDestination(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={17} color="#7f9f97" />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-down" size={15} color="#7f9f97" />
              )}
            </TouchableOpacity>

            {tripActive && !loadingTrip && safeLegs.length > 0 && (
              <TouchableOpacity
                style={styles.summaryRow}
                activeOpacity={0.8}
                onPress={() => setDetailsOpen(!detailsOpen)}
              >
                <View style={styles.summaryPill}>
                  <Ionicons name="car" size={12} color="#2c7a6e" />
                  <Text style={styles.summaryText}>
                    {safeLegs.length} ride{safeLegs.length > 1 ? "s" : ""}
                  </Text>
                </View>

                <View style={styles.summaryPill}>
                  <Ionicons name="time-outline" size={12} color="#2c7a6e" />
                  <Text style={styles.summaryText}>{fmtMin(totalDuration)}</Text>
                </View>

                <View style={styles.summaryPill}>
                  <Ionicons name="git-commit-outline" size={12} color="#2c7a6e" />
                  <Text style={styles.summaryText}>{fmtKm(totalDistance)}</Text>
                </View>

                {fareLegs.length > 0 && (
                  <View style={styles.summaryPill}>
                    <Ionicons name="cash-outline" size={12} color="#2c7a6e" />
                    <Text style={styles.summaryText}>
                      {peso(fareLow)}–{peso(fareHigh)}
                    </Text>
                  </View>
                )}

                <Ionicons
                  name={detailsOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#2c7a6e"
                />
              </TouchableOpacity>
            )}

            {tripActive && loadingTrip && (
              <View style={styles.summaryRow}>
                <ActivityIndicator size="small" color="#2c7a6e" />
                <Text style={styles.loadingText}>Building route…</Text>
              </View>
            )}

            {tripActive && detailsOpen && safeLegs.length > 0 && (
              <View style={styles.details}>
                <ScrollView
                  style={{ maxHeight: 180 }}
                  showsVerticalScrollIndicator={false}
                >
                  {safeLegs.map((leg, idx) => (
                    <View key={idx} style={styles.legRow}>
                      <View style={[styles.legBadge, legBadgeStyle(idx, safeLegs.length)]}>
                        <Ionicons name="car" size={11} color="#fff" />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.legTitle}>
                          Ride to {leg.to.name}
                          {leg.to.terminal_id === HUB_TERMINAL_ID && (
                            <Text style={styles.hubTag}> · Hub</Text>
                          )}
                        </Text>
                        <Text style={styles.legStats}>
                          {fmtKm(leg.route.distance_km)} · {fmtMin(leg.route.duration_min)}
                          {leg.fare ? ` · ${peso(Math.min(leg.fare.regular_t, leg.fare.regular_m))}–${peso(Math.max(leg.fare.regular_t, leg.fare.regular_m))}` : ""}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {fareLegs.length > 0 && (
                  <View style={styles.fareBox}>
                    <View style={styles.fareRow}>
                      <Text style={styles.fareLabel}>Traditional UVE</Text>
                      <Text style={styles.fareValue}>{peso(totalRegularT)}</Text>
                    </View>

                    <View style={styles.fareRow}>
                      <Text style={styles.fareLabel}>Modern UVE</Text>
                      <Text style={styles.fareValue}>{peso(totalRegularM)}</Text>
                    </View>

                    <View style={styles.fareDivider} />

                    <View style={styles.fareRow}>
                      <Text style={styles.fareLabelMuted}>Student / Senior / PWD</Text>
                      <Text style={styles.fareValueMuted}>
                        from {peso(Math.min(totalDiscountedT, totalDiscountedM))}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>

          <View
            style={[
              styles.navRow,
              { bottom: navBottomOffset },
            ]}
          >
            <GridNavButton title="Dashboard"   route="/Dashboard"  icon="view-dashboard-outline" active={pathname === "/Dashboard"} />
            <GridNavButton title="Map routes"  route="/mapping"    icon="map-marker-path"        active={pathname === "/mapping"} />
            <GridNavButton title="Fare prices" route="/farePrices" icon="cash-multiple"          active={pathname === "/farePrices"} />
            <GridNavButton title="Profile"     route="/profile"    icon="account-circle"         active={pathname === "/profile"} />
          </View>
        </View>
      </ImageBackground>

      {/* DESTINATION PICKER */}
      <Modal
        transparent
        visible={pickerOpen}
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPickerOpen(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Where to?</Text>
            <FlatList
              data={terminals}
              keyExtractor={(t) => String(t.terminal_id)}
              renderItem={({ item }) => {
                const isSelected = destination?.terminal_id === item.terminal_id;
                return (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setDestination(item);
                      setPickerOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalItemText}>{item.terminal_name}</Text>
                      <Text style={styles.modalItemSub} numberOfLines={1}>
                        {item.terminal_address}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color="#2c7a6e" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  background: { flex: 1 },
  overlay: { flex: 1 },

  // ============================================================
  // HEADER CARD
  // ============================================================
  headerCard: {
    position: "absolute",
    top: 10,
    left: 15,
    right: 15,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,

    backgroundColor: "#ffffffb1",
    borderTopRightRadius: 14,
    borderTopLeftRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,

    borderWidth: 1,
    borderColor: "rgb(250, 250, 250)",

    shadowColor: "#ffffffb1",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  welcome: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: '#1f6f66',
    marginBottom: 2,
  },
  greeting: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#2c3e50",
    textAlign: "right",
  },

   mapToggle: {
    position: "absolute",
    left: 15,     
    zIndex: 8,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgb(255, 255, 255)",
    backgroundColor: "#ffffffb1",
    shadowColor: "#ffffffb1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },

  mapToggleBlur: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  // ============================================================
  // FIELD CARD
  // ============================================================
  fieldCard: {
    position: "absolute",
    top: 66,
    left: 15,
    right: 15,
    zIndex: 9,

    backgroundColor: "#ffffffb1",
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,

    borderWidth: 1,
    borderColor: "rgb(255, 255, 255)",

    shadowColor: "#ffffffb1",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },

  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f7fbfa",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#dcebe6",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  fieldText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "monster_act",
    color: "#1a1a1a",
  },

  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#f0f7f5",
    borderRadius: 11,
  },

  summaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dcebe6",
  },

  summaryText: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#2c7a6e",
  },

  loadingText: {
    fontSize: 11,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginLeft: 8,
  },

  details: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#dcebe6",
  },

  legRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },

  legBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  
  legBadgeFirst: { backgroundColor: "#2196F3" },
  legBadgeMid: { backgroundColor: "#f39c12" },
  legBadgeLast: { backgroundColor: "#e74c3c" },

  legTitle: {
    fontSize: 12,
    fontFamily: "monsterrat_kp",
    color: "#1a1a1a",
  },

  hubTag: {
    fontSize: 10, fontFamily: "monster_act", color: "#7f9f97",
  },

  legStats: {
    fontSize: 10,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginTop: 1,
  },

  fareBox: {
    backgroundColor: "#f7fbfa",
    borderRadius: 11,
    padding: 10,
    borderWidth: 1,
    borderColor: "#dcebe6",
    marginTop: 8,
  },

  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },

  fareLabel: { fontSize: 12, fontFamily: "monster_act", color: "#1a1a1a" },
  fareValue: {
    fontSize: 13,
    fontFamily: "monsterrat_kp",
    color: "#2c7a6e",
    fontWeight: "700",
  },

  fareDivider: {
    height: 0.5,
    backgroundColor: "#dcebe6",
    marginVertical: 5,
  },
  fareLabelMuted: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },
  fareValueMuted: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },

  // ============================================================
  // MAP
  // ============================================================
  map: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#e9efe9",
  },

  // ============================================================
  // BOTTOM NAV
  // NOTE: `bottom` is applied dynamically via insets — see `navBottomOffset`
  // ============================================================
  navRow: {
    position: "absolute",
    width: "94%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderRadius: 26,
    height: 56,
    backgroundColor: "rgba(255, 255, 255, 0.23)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    shadowColor: "#1f3d3810",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 20,
  },

  // ============================================================
  // MODAL
  // ============================================================
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center", paddingHorizontal: 30,
  },
  modalSheet: {
    backgroundColor: "#fff", borderRadius: 16,
    paddingVertical: 12, maxHeight: height * 0.7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 14, elevation: 10,
  },
  modalTitle: {
    fontSize: 15, fontFamily: "monsterrat_kp", color: "#1f6f66",
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: 0.5, borderBottomColor: "#eaf3f1",
  },
  modalItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: "#eaf3f1",
  },
  modalItemText: { fontSize: 14, fontFamily: "monster_act", color: "#1a1a1a" },
  modalItemSub: {
    fontSize: 11, fontFamily: "monster_act",
    color: "#7f9f97", marginTop: 2,
  },
});