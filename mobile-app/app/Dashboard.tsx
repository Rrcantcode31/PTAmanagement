import {
  View, Text, StyleSheet, ImageBackground, Dimensions,
  ActivityIndicator, TouchableOpacity, Modal, FlatList, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { usePathname } from "expo-router";
import WebView from "react-native-webview";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import GridNavButton from "./components/GridNavButton";
import { useAuth } from "../appContext/authContext";
import { API_URL } from "./_layout";

const { width, height } = Dimensions.get("window");

// Koronadal City Public Terminal — the hub every route passes through
const HUB_TERMINAL_ID = 1;

// ============================================================
// Types
// ============================================================
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

// ============================================================
// OSRM helper — one call returns geometry + distance + duration
// ============================================================
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

// ============================================================
// Nearest-terminal helper
// ============================================================
function findNearest(list: Terminal[], lat: number, lng: number): Terminal | null {
  let best: Terminal | null = null;
  let bestD = Infinity;
  for (const t of list) {
    const d = (t.latitude - lat) ** 2 + (t.longitude - lng) ** 2;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

// ============================================================
// Main screen
// ============================================================
export default function Dashboard() {
  const pathname = usePathname();
  const { user, token } = useAuth();
  const webViewRef = useRef<WebView>(null);

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [destination, setDestination] = useState<Terminal | null>(null);
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
    digitalFont: require("../assets/Font/digitalFont.ttf"),
  });

  // ============================================================
  // EFFECT 1 — Get GPS
  // ============================================================
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

  // ============================================================
  // EFFECT 2 — Load all terminals
  // ============================================================
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

  // ============================================================
  // EFFECT 3 — Build the trip plan via hub-and-spoke model
  //
  // Every trip goes through Koronadal (the hub).
  //
  //   user   → nearest terminal
  //   nearest → hub             (only if nearest ≠ hub)
  //   hub    → destination      (only if destination ≠ hub)
  //
  // Special cases:
  //   - destination === nearest → single leg (user → destination)
  //   - destination === hub     → 2 legs (user → nearest → hub)
  //   - nearest === hub         → 2 legs (user → hub → destination)
  // ============================================================
  useEffect(() => {
    if (!myLocation || !destination || terminals.length === 0 || !token) {
      setTripPlan(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingTrip(true);

        // ---------- 1. Build the ordered list of stops ----------
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
          // No terminals in DB — go direct
          stops.push(destStop);
        } else if (nearestStop.terminal_id === destination.terminal_id) {
          // Destination IS the user's nearest → single-leg trip
          stops.push(destStop);
        } else if (!hubStop) {
          // No hub — nearest → destination directly
          stops.push(nearestStop);
          stops.push(destStop);
        } else if (nearestStop.terminal_id === HUB_TERMINAL_ID) {
          // User's nearest IS the hub
          stops.push(hubStop);
          stops.push(destStop);
        } else if (destination.terminal_id === HUB_TERMINAL_ID) {
          // Destination IS the hub
          stops.push(nearestStop);
          stops.push(hubStop);
        } else {
          // Full hub-and-spoke: user → nearest → hub → destination
          stops.push(nearestStop);
          stops.push(hubStop);
          stops.push(destStop);
        }

        // ---------- 2. Fetch OSRM routes for each leg in parallel ----------
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

        // ---------- 3. Fetch fares for terminal-to-terminal legs ----------
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

  // ============================================================
  // EFFECT 4 — Push the trip plan to the map
  // ============================================================
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

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
    : "Commuter";

  // ---- Safe accessors (protect against stale state after hot-reload) ----
  const safeStops = tripPlan && Array.isArray(tripPlan.stops) ? tripPlan.stops : [];
  const safeLegs = tripPlan && Array.isArray(tripPlan.legs) ? tripPlan.legs : [];

  const fareLegs = safeLegs.filter((l) => l.fare);
  const totalRegularT = fareLegs.reduce((s, l) => s + (l.fare?.regular_t ?? 0), 0);
  const totalRegularM = fareLegs.reduce((s, l) => s + (l.fare?.regular_m ?? 0), 0);
  const totalDiscountedT = fareLegs.reduce((s, l) => s + (l.fare?.discounted_t ?? 0), 0);
  const totalDiscountedM = fareLegs.reduce((s, l) => s + (l.fare?.discounted_m ?? 0), 0);

  const peso = (v: number | undefined | null) =>
    v == null ? "—" : `₱${Number(v).toFixed(2)}`;

  const fmtKm = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

  const fmtMin = (m: number) =>
    m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;

  const tripActive = !!destination;

  // Badge color for a leg index
  const legBadgeStyle = (idx: number, total: number) => {
    if (idx === 0) return styles.legBadgeFirst;
    if (idx === total - 1) return styles.legBadgeLast;
    return styles.legBadgeMid;
  };

  // ============================================================
  // Leaflet HTML — full map with route drawing
  // ============================================================
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
        #map { position: absolute; inset: 0; }
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

          // ----- Legs (color-coded) -----
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

          // ----- Terminal stop markers -----
          data.terminalStops.forEach(function (stop) {
            if (stop.isDestination) {
              // Orange destination pin
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
              // Green bus icon for intermediate stops
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
            maxBounds: b,
            maxBoundsViscosity: 1.0,
            minZoom: 11,
            maxZoom: 20,
          });
          map.fitBounds(b, { padding: [10, 10] });
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);
        }
        document.addEventListener('DOMContentLoaded', initMap);
      </script>
    </body>
    </html>
  `;

  // ============================================================
  // Render
  // ============================================================
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ImageBackground
        source={require("../assets/images/main-bg.png")}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay}>

          {/* HEADER */}
          <View style={styles.headerSection}>
            <Text style={styles.welcome}>Dashboard</Text>
            <Text style={styles.name}>{displayName}</Text>
          </View>

          {/* TRIP PLANNER */}
          <View style={styles.plannerSection}>
            <View style={styles.plannerCard}>

              {/* FROM */}
              <Text style={styles.fieldLabel}>FROM</Text>
              <View style={[styles.field, styles.fieldReadOnly]}>
                <Ionicons name="location" size={16} color="#2c7a6e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldText}>Your current location</Text>
                  {safeLegs.length > 0 && (
                    <Text style={styles.fieldSub}>
                      Ride to {safeLegs[0].to.name}
                      {safeLegs[0].to.isHub ? " (Hub)" : ""}
                    </Text>
                  )}
                </View>
              </View>

              {/* TO */}
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>TO</Text>
              <TouchableOpacity
                style={styles.field}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="navigate" size={16} color="#D85A30" />
                <Text style={styles.fieldText} numberOfLines={1}>
                  {destination ? destination.terminal_name : "Select destination"}
                </Text>
                {destination ? (
                  <TouchableOpacity
                    onPress={() => setDestination(null)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#7f9f97" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-down" size={16} color="#7f9f97" />
                )}
              </TouchableOpacity>

              {/* TRIP BREAKDOWN */}
              {tripActive && (
                <View style={styles.results}>
                  {loadingTrip ? (
                    <ActivityIndicator size="small" color="#2c7a6e" style={{ marginVertical: 14 }} />
                  ) : safeLegs.length > 0 ? (
                    <>
                      <ScrollView
                        style={{ maxHeight: 240 }}
                        showsVerticalScrollIndicator={false}
                      >
                        {safeLegs.map((leg, idx) => (
                          <View key={idx} style={styles.legRow}>
                            <View style={[styles.legBadge, legBadgeStyle(idx, safeLegs.length)]}>
                              <Ionicons name="car" size={13} color="#fff" />
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
                              </Text>

                              {leg.fare && (
                                <View style={styles.legFareRow}>
                                  <Text style={styles.legFareLabel}>FARE</Text>
                                  <Text style={styles.legFareValue}>
                                    {peso(Math.min(leg.fare.regular_t, leg.fare.regular_m))}
                                    {" – "}
                                    {peso(Math.max(leg.fare.regular_t, leg.fare.regular_m))}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        ))}
                      </ScrollView>

                      {/* TOTAL FARE SUMMARY */}
                      {fareLegs.length > 0 && (
                        <View style={styles.fareBox}>
                          <Text style={styles.fareBoxTitle}>
                            TOTAL FARE FOR THE TRIP
                          </Text>

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
                    </>
                  ) : myLocation ? (
                    <Text style={styles.noFare}>Route unavailable right now.</Text>
                  ) : (
                    <Text style={styles.noFare}>Waiting for your location…</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* MAP */}
          <View style={styles.mapContainer}>
            <WebView
              ref={webViewRef}
              originWhitelist={["*"]}
              source={{ html: leafletMapHTML }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              geolocationEnabled
              onLoadEnd={() => {
                if (myLocation) {
                  webViewRef.current?.injectJavaScript(`
                    window.setUserLocation?.(${myLocation.lat}, ${myLocation.lng});
                    true;
                  `);
                }

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
          </View>

          {/* BOTTOM NAV */}
          <View style={styles.navRow}>
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

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  background: { flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(255, 255, 255, 0.2)" },

  // Header
  headerSection: { paddingHorizontal: 15, paddingTop: 10, paddingBottom: 5 },
  welcome: {
    fontSize: 18, fontFamily: "monsterrat_kp",
    color: "#1e2a3a", fontWeight: "600", letterSpacing: 0.5,
  },
  name: {
    fontSize: 16, fontFamily: "monster_act", color: "#2c3e50",
    paddingBottom: 10, borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)", marginTop: 4,
  },

  // Trip planner
  plannerSection: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 10 },
  plannerCard: {
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(210, 230, 224, 0.9)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  fieldLabel: {
    fontSize: 10, letterSpacing: 1.2, fontFamily: "monsterrat_font",
    fontWeight: "700", color: "#7f9f97", marginBottom: 4, paddingLeft: 2,
  },
  field: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f7fbfa",
    borderRadius: 12, borderWidth: 1, borderColor: "#dcebe6",
    paddingHorizontal: 12, paddingVertical: 11,
  },
  fieldReadOnly: { backgroundColor: "#f0f7f5" },
  fieldText: { flex: 1, fontSize: 14, fontFamily: "monster_act", color: "#1a1a1a" },
  fieldSub: { fontSize: 11, fontFamily: "monster_act", color: "#2c7a6e", marginTop: 2 },

  results: { marginTop: 12 },

  legRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
  },
  legBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  legBadgeFirst: { backgroundColor: "#2196F3" },
  legBadgeMid: { backgroundColor: "#f39c12" },
  legBadgeLast: { backgroundColor: "#e74c3c" },

  legTitle: {
    fontSize: 13, fontFamily: "monsterrat_kp", color: "#1a1a1a",
  },
  hubTag: {
    fontSize: 10, fontFamily: "monster_act", color: "#7f9f97",
  },
  legStats: {
    fontSize: 11, fontFamily: "monster_act", color: "#7f9f97", marginTop: 2,
  },
  legFareRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4,
  },
  legFareLabel: {
    fontSize: 10, fontFamily: "monsterrat_font",
    fontWeight: "700", color: "#7f9f97", letterSpacing: 0.6,
  },
  legFareValue: {
    fontSize: 12, fontFamily: "monsterrat_kp",
    color: "#2c7a6e", fontWeight: "700",
  },

  fareBox: {
    backgroundColor: "#f7fbfa",
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "#dcebe6",
    marginTop: 10,
  },
  fareBoxTitle: {
    fontSize: 10, fontFamily: "monsterrat_font",
    fontWeight: "700", color: "#7f9f97",
    letterSpacing: 1, marginBottom: 8,
  },
  fareRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 5,
  },
  fareLabel: { fontSize: 13, fontFamily: "monster_act", color: "#1a1a1a" },
  fareValue: {
    fontSize: 14, fontFamily: "monsterrat_kp",
    color: "#2c7a6e", fontWeight: "700",
  },
  fareDivider: {
    height: 0.5, backgroundColor: "#dcebe6", marginVertical: 6,
  },
  fareLabelMuted: { fontSize: 12, fontFamily: "monster_act", color: "#7f9f97" },
  fareValueMuted: { fontSize: 12, fontFamily: "monster_act", color: "#7f9f97" },

  noFare: {
    fontSize: 12, fontFamily: "monster_act",
    color: "#7f9f97", textAlign: "center", paddingVertical: 10,
  },

  // Map
  mapContainer: { flex: 1, width, backgroundColor: "#f0f0f0" },
  map: { flex: 1, width: "100%", height: "100%", backgroundColor: "#f0f0f0" },

  // Bottom nav
  navRow: {
    position: "absolute", bottom: 25, width: "90%", alignSelf: "center",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, borderRadius: 24, height: 46,
    backgroundColor: "rgba(233, 233, 233, 0.64)",
    borderWidth: 0.8, borderColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },

  // Picker modal
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