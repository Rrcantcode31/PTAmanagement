import { useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  FlatList, ActivityIndicator, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { BlurTargetView } from "expo-blur";
import { useFonts } from "expo-font";
import { usePathname } from "expo-router";
import GridNavButton from "./components/GridNavButton";
import { API_URL } from "./_layout";
import { useAuth } from "../appContext/authContext";

const { height: H } = Dimensions.get("window");

// ---------- Types ----------
type Terminal = {
  terminal_id: number;
  terminal_name: string;
  terminal_address: string;
  latitude: number;
  longitude: number;
};

type QueueItem = {
  queue_id: number;
  driver_id: number;
  driver_name: string;
  plate_number: string;
  vehicle_type: string;
  queue_position: number;
  queue_status: "WAITING" | "QUEUED";
};

// ============================================================
// Leaflet HTML builder
// - Always renders the map
// - Shows hub dot as soon as hub is known
// - Adds dest pin + OSRM route only when dest is picked
// ============================================================
function buildLeafletHTML(hub: Terminal | null, dest: Terminal | null): string {
  const center = hub && dest
    ? {
        lat: (Number(hub.latitude)  + Number(dest.latitude))  / 2,
        lng: (Number(hub.longitude) + Number(dest.longitude)) / 2,
      }
    : hub
      ? { lat: Number(hub.latitude), lng: Number(hub.longitude) }
      : { lat: 6.48409, lng: 124.85211 };   // Koronadal fallback

  const hubJson  = hub
    ? JSON.stringify({ lat: Number(hub.latitude),  lng: Number(hub.longitude),  name: hub.terminal_name })
    : "null";
  const destJson = dest
    ? JSON.stringify({ lat: Number(dest.latitude), lng: Number(dest.longitude), name: dest.terminal_name })
    : "null";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #e9efe9; }
    .leaflet-control-attribution { font-size: 9px; }
    .hub-dot {
      width: 22px; height: 22px; border-radius: 50%;
      background: #e74c3c; border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    }
    .dest-pin { width: 28px; height: 40px; }
    .dest-pin svg { width: 100%; height: 100%; }
    .leaflet-popup-content {
      margin: 8px 12px;
      font-family: sans-serif;
      font-size: 13px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView([${center.lat}, ${center.lng}], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const hub  = ${hubJson};
    const dest = ${destJson};

    // -------- Hub dot (Koronadal) — always shown once hub is known --------
    if (hub) {
      L.marker([hub.lat, hub.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="hub-dot"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(map).bindPopup(hub.name);
    }

    // -------- Destination pin + route (only when a terminal is picked) --------
    if (hub && dest) {
      L.marker([dest.lat, dest.lng], {
        icon: L.divIcon({
          className: '',
          html:
            '<div class="dest-pin">' +
              '<svg viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 24 12 24s12-15.6 12-24C24 5.4 18.6 0 12 0z" ' +
                'fill="#2a7be4" stroke="#fff" stroke-width="2"/>' +
                '<circle cx="12" cy="12" r="4.5" fill="#fff"/>' +
              '</svg>' +
            '</div>',
          iconSize: [28, 40],
          iconAnchor: [14, 40],
          popupAnchor: [0, -36],
        }),
      }).addTo(map).bindPopup(dest.name).openPopup();

      const osrmUrl = 'https://router.project-osrm.org/route/v1/driving/'
        + hub.lng + ',' + hub.lat + ';'
        + dest.lng + ',' + dest.lat
        + '?overview=full&geometries=geojson';

      fetch(osrmUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map(function (c) {
              return [c[1], c[0]];
            });
            const line = L.polyline(coords, {
              color: '#e74c3c', weight: 5, opacity: 0.9,
            }).addTo(map);
            map.fitBounds(line.getBounds(), { padding: [80, 80] });
          }
        })
        .catch(function (err) { console.error('OSRM error:', err); });
    }
  </script>
</body>
</html>
  `.trim();
}

// ============================================================
// Main component
// ============================================================
export default function Mapping() {
  const pathname = usePathname();
  const { token } = useAuth();

  const [terminals, setTerminals]       = useState<Terminal[]>([]);
  const [koronadal, setKoronadal]       = useState<Terminal | null>(null);
  const [selected, setSelected]         = useState<Terminal | null>(null);
  const [queue, setQueue]               = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const mapTargetRef = useRef(null);

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
  });

  // ---- Load terminals ----
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/getTerminalsLocation`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        const all: Terminal[] = data.terminals || [];

        const others = all.filter(
          (t) => t.terminal_name !== "Koronadal City"
        );
        setTerminals(others);

        const hub = all.find((t) => t.terminal_name === "Koronadal City") || null;
        setKoronadal(hub);

        console.log("[mapping] terminals loaded:", all.length, "hub:", hub?.terminal_name);
      } catch (err) {
        console.error("Failed to load terminals:", err);
      }
    })();
  }, [token]);

  // ---- Fetch queue when a terminal is selected ----
  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        setLoadingQueue(true);
        const res = await fetch(
          `${API_URL}/api/auth/terminalQueue?terminal_id=${selected.terminal_id}`,
          { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }
        );
        const json = await res.json();
        if (json.success && json.data) {
          setQueue(json.data.queue || []);
        } else {
          setQueue([]);
        }
      } catch (err) {
        console.error("queue fetch failed:", err);
        setQueue([]);
      } finally {
        setLoadingQueue(false);
      }
    })();
  }, [selected, token]);

  if (!fontsLoaded) return null;

  const leafletHTML = buildLeafletHTML(koronadal, selected);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.root}>

        {/* ---------- FULL-SCREEN MAP (always shown) ---------- */}
        <BlurTargetView ref={mapTargetRef} style={StyleSheet.absoluteFill}>
          <WebView
            originWhitelist={["*"]}
            source={{ html: leafletHTML }}
            style={{ flex: 1, backgroundColor: "#e9efe9" }}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
          />
        </BlurTargetView>

        {/* ---------- TOP OVERLAY: TITLE + DROPDOWN ---------- */}
        <View style={styles.topOverlay}>
          <Text style={styles.welcome}>Terminal Routes</Text>

          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setDropdownOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.dropdownText}>
              {selected
                ? `Koronadal - ${selected.terminal_name}`
                : "Select terminal"}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#1f6f66" />
          </TouchableOpacity>
        </View>

        {/* ---------- BOTTOM OVERLAY: QUEUE INFO ---------- */}
        {selected && (
          <View style={styles.bottomOverlay}>
            <View style={styles.queueBox}>
              <View style={styles.queueHeader}>
                <Text style={styles.queueTitle}>
                  Queued vehicles on this route
                </Text>
                <Text style={styles.queueCount}>
                  {loadingQueue ? "…" : `${queue.length} in queue`}
                </Text>
              </View>

              {loadingQueue ? (
                <ActivityIndicator size="small" color="#2c7a6e" style={{ marginVertical: 12 }} />
              ) : queue.length === 0 ? (
                <Text style={styles.queueEmpty}>No vehicles queued right now.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
                  {queue.map((q, idx) => (
                    <View key={q.queue_id} style={styles.queueRow}>
                      <View style={[
                        styles.queuePos,
                        idx === 0 && styles.queuePosFirst,
                      ]}>
                        <Text style={styles.queuePosText}>#{q.queue_position}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.queueName}>{q.driver_name}</Text>
                        <Text style={styles.queueSub}>
                          {q.plate_number} · {q.vehicle_type}
                        </Text>
                      </View>
                      <Text style={[
                        styles.queueStatus,
                        idx === 0 ? styles.statusNext : styles.statusWait,
                      ]}>
                        {idx === 0 ? "Next" : "Waiting"}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        )}

        {/* ---------- BOTTOM NAV ---------- */}
        <View style={styles.row}>
          <GridNavButton title="Dashboard"   route="/Dashboard"   icon="view-dashboard-outline" active={pathname === "/Dashboard"} />
          <GridNavButton title="Map routes"  route="/mapping"     icon="map-marker-path"        active={pathname === "/mapping"} />
          <GridNavButton title="Fare prices" route="/farePrices"  icon="cash-multiple"          active={pathname === "/farePrices"} />
          <GridNavButton title="Vehicles"    route="/vehicle"     icon="car"                    active={pathname === "/vehicle"} />
          <GridNavButton title="Profile"     route="/profile"     icon="account-circle"         active={pathname === "/profile"} />
        </View>

      </View>

      {/* ---------- DROPDOWN MODAL ---------- */}
      <Modal
        transparent
        visible={dropdownOpen}
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select terminal</Text>
            <FlatList
              data={terminals}
              keyExtractor={(t) => String(t.terminal_id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelected(item);
                    setDropdownOpen(false);
                  }}
                >
                  <Text style={styles.modalItemText}>
                    Koronadal - {item.terminal_name}
                  </Text>
                  {selected?.terminal_id === item.terminal_id && (
                    <Ionicons name="checkmark" size={18} color="#2c7a6e" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmpty}>No terminals available.</Text>
              }
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
  safeArea: { flex: 1, backgroundColor: "#e9efe9" },
  root: { flex: 1, backgroundColor: "#e9efe9" },

  // ---------- Top overlay ----------
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 14,
    zIndex: 10,
  },
  welcome: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: "#1f6f66",
    marginBottom: 10,
    textShadowColor: "rgba(255,255,255,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d0e6e0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  dropdownText: {
    fontSize: 14,
    fontFamily: "monster_act",
    color: "#1a1a1a",
  },

  // ---------- Bottom overlay (queue info) ----------
  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 85,
    paddingHorizontal: 15,
    zIndex: 10,
  },
  queueBox: {
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2f0ec",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  queueTitle: {
    fontSize: 13,
    fontFamily: "monsterrat_kp",
    color: "#1a1a1a",
  },
  queueCount: {
    fontSize: 11,
    fontFamily: "monster_act",
    color: "#7f9f97",
  },
  queueEmpty: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#7f9f97",
    paddingVertical: 6,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#eaf3f1",
    gap: 10,
  },
  queuePos: {
    backgroundColor: "#2c7a6e",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 34,
    alignItems: "center",
  },
  queuePosFirst: { backgroundColor: "#D85A30" },
  queuePosText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "monsterrat_kp",
    fontWeight: "bold",
  },
  queueName: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#1a1a1a",
  },
  queueSub: {
    fontSize: 10,
    fontFamily: "monster_act",
    color: "#7f9f97",
  },
  queueStatus: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    overflow: "hidden",
  },
  statusNext: { backgroundColor: "#e0f2e9", color: "#1e6f4c" },
  statusWait: { backgroundColor: "#fff0db", color: "#c97e00" },

  // ---------- Bottom nav ----------
  row: {
    position: "absolute",
    bottom: 25,
    width: "90%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderRadius: 24,
    height: 46,
    backgroundColor: "rgba(233, 233, 233, 0.94)",
    borderWidth: 0.8,
    borderColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 20,
  },

  // ---------- Dropdown modal ----------
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 12,
    maxHeight: H * 0.7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: "monsterrat_kp",
    color: "#1f6f66",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eaf3f1",
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eaf3f1",
  },
  modalItemText: {
    fontSize: 14,
    fontFamily: "monster_act",
    color: "#1a1a1a",
  },
  modalEmpty: {
    textAlign: "center",
    paddingVertical: 24,
    color: "#7f9f97",
    fontSize: 13,
  },
});