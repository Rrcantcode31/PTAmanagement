import { useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  FlatList, ActivityIndicator, Dimensions, Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { BlurView, BlurTargetView } from "expo-blur";
import { useFonts } from "expo-font";
import { usePathname } from "expo-router";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";

const { height: H } = Dimensions.get("window");

const HEADER_TOP = 12;
const EXPANDED_RATIO = 0.75;
const COLLAPSED_VISIBLE_ROWS = 1;

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
// ============================================================
function buildLeafletHTML(hub: Terminal | null, dest: Terminal | null): string {
  const center = hub && dest
    ? {
        lat: (Number(hub.latitude)  + Number(dest.latitude))  / 2,
        lng: (Number(hub.longitude) + Number(dest.longitude)) / 2,
      }
    : hub
      ? { lat: Number(hub.latitude), lng: Number(hub.longitude) }
      : { lat: 6.48409, lng: 124.85211 };

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
            map.fitBounds(line.getBounds(), { padding: [140, 140] });
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
  const [expanded, setExpanded]         = useState(false);

  const mapTargetRef = useRef(null);

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../../assets/Font/monster_act.ttf"),
    digitalFont: require("../../assets/Font/digitalFont.ttf"),
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

        const others = all.filter((t) => t.terminal_name !== "Koronadal City");
        setTerminals(others);

        const hub = all.find((t) => t.terminal_name === "Koronadal City") || null;
        setKoronadal(hub);
      } catch (err) {
        console.error("Failed to load terminals:", err);
      }
    })();
  }, [token]);

  // ---- Fetch queue when a terminal is selected ----
  useEffect(() => {
    if (!selected) {
      setQueue([]);
      setExpanded(false);
      return;
    }

    (async () => {
      try {
        setLoadingQueue(true);
        const res = await fetch(
          `${API_URL}/api/auth/terminalQueue?terminal_id=${selected.terminal_id}`,
          { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }
        );
        const json = await res.json();
        setQueue(json.success && json.data ? (json.data.queue || []) : []);
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

  const hasTerminal = !!selected;
  const hasQueue    = queue.length > 0;
  const isExpanded  = expanded && hasQueue;

  const renderPanelBody = () => {
    if (loadingQueue) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color="#2c7a6e" />
          <Text style={styles.stateText}>Loading queue…</Text>
        </View>
      );
    }

    if (!hasQueue) {
      return (
        <View style={styles.stateBox}>
          <Ionicons name="car-outline" size={28} color="#7f9f97" />
          <Text style={styles.stateText}>No vehicle available yet</Text>
        </View>
      );
    }

    const visibleQueue = isExpanded
      ? queue
      : queue.slice(0, COLLAPSED_VISIBLE_ROWS);

    return (
      <>
        <ScrollView
          style={isExpanded ? { flex: 1 } : undefined}
          scrollEnabled={isExpanded}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        >
          {visibleQueue.map((q, idx) => (
            <View
              key={q.queue_id}
              style={[styles.queuePill, idx === 0 && styles.queuePillFirst]}
            >
              <View style={[styles.queuePos, idx === 0 && styles.queuePosFirst]}>
                <Text style={styles.queuePosText}>#{q.queue_position}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.queueName} numberOfLines={1}>
                  {q.driver_name}
                </Text>
                <Text style={styles.queueSub} numberOfLines={1}>
                  {q.plate_number} · {q.vehicle_type}
                </Text>
              </View>

              <Text
                style={[
                  styles.queueStatus,
                  idx === 0 ? styles.statusNext : styles.statusWait,
                ]}
              >
                {idx === 0 ? "Next" : "Waiting"}
              </Text>
            </View>
          ))}
        </ScrollView>

        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={styles.toggleBar}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#2c7a6e"
          />
          <Text style={styles.toggleText}>
            {isExpanded ? "Collapse" : `Show all ${queue.length} queued`}
          </Text>
        </Pressable>
      </>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.root}>

        {/* Full-screen map */}
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

        {/* Top overlay */}
        <View style={styles.topOverlay}>

          {/* ============ HEADER CARD ============ */}
          <View style={styles.headerCard}>
            <BlurView
              intensity={100}
              tint="light"
              blurMethod="dimezisBlurView"
              blurTarget={mapTargetRef}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Terminal Route</Text>

              {/* ==============================================
                  SELECT TERMINAL BUTTON
              ============================================== */}
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => setDropdownOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.selectBtnText} numberOfLines={1}>
                  {selected ? selected.terminal_name : "Select terminal"}
                </Text>
                <Ionicons name="chevron-down" size={14} color="#1f6f66" />
              </TouchableOpacity>
            </View>

            {/* Toggle handle line REMOVED from the header card */}
          </View>

          {/* ============ QUEUE / CONTENT PANEL ============ */}
          {hasTerminal && (
            <View
              style={[
                styles.queuePanel,
                isExpanded && { height: H * EXPANDED_RATIO },
              ]}
            >
              <BlurView
                intensity={100}
                tint="light"
                blurMethod="dimezisBlurView"
                blurTarget={mapTargetRef}
                style={StyleSheet.absoluteFill}
              />

              <View style={styles.queuePanelContent}>
                {renderPanelBody()}
              </View>
            </View>
          )}

          {/* When no terminal is picked, still show the prompt card */}
          {!hasTerminal && (
            <View style={styles.queuePanel}>
              <BlurView
                intensity={100}
                tint="light"
                blurMethod="dimezisBlurView"
                blurTarget={mapTargetRef}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.queuePanelContent}>
                <View style={styles.stateBox}>
                  <Ionicons name="location-outline" size={26} color="#7f9f97" />
                  <Text style={styles.stateText}>Please select terminal</Text>
                </View>
                {/* Handle kept in the panel */}
                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Bottom nav */}
        <View style={styles.row}>
          <GridNavButton title="Dashboard" route="/Dashboard" icon="view-dashboard-outline" active={pathname === "/Dashboard"} />
          <GridNavButton title="Map routes" route="/mapping" icon="map-marker-path" active={pathname === "/mapping"} />
          <GridNavButton title="Fare prices" route="/farePrices" icon="cash-multiple" active={pathname === "/farePrices"} />
          <GridNavButton title="Profile" route="/profile" icon="account-circle" active={pathname === "/profile"} />
        </View>

      </View>

      {/* Dropdown modal */}
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

  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingTop: HEADER_TOP,
    zIndex: 10,
    gap: 10,
  },

  // ---------- Header card ----------
  headerCard: {
    borderTopRightRadius: 14,
    borderTopLeftRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,     // even padding since we removed the handle
    gap: 10,
  },

  headerTitle: {
    fontSize: 16,
    fontFamily: "monsterrat_kp",
    color: "#1a1a1a",
    flexShrink: 0,
  },

  // ---------- Select terminal button ----------
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e0f0ec",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a8d5c8",
    maxWidth: 180,
    flexShrink: 1,
  },
  selectBtnText: {
    fontSize: 13,
    fontFamily: "monster_act",
    color: "#1f6f66",
    flexShrink: 1,
  },

  // Handle (kept in the queue panel)
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#c8d4d0",
  },

  // ---------- Panel ----------
  queuePanel: {
     borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  queuePanelContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },

  stateBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 8,
  },

  stateText: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#7f9f97",
    textAlign: "center",
  },

  // ---------- Queue rows ----------
  queuePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(200, 220, 215, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  queuePillFirst: {
    borderColor: "#D85A30",
    backgroundColor: "rgba(255, 244, 240, 0.95)",
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
    fontFamily: "monsterrat_kp",
    color: "#1a1a1a",
  },
  queueSub: {
    fontSize: 10,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginTop: 1,
  },
  queueStatus: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: "hidden",
  },
  statusNext: { backgroundColor: "#ffe6d6", color: "#b8491d" },
  statusWait: { backgroundColor: "#fff0db", color: "#c97e00" },

  toggleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 10,
    paddingBottom: 6,
    marginTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(200, 220, 215, 0.7)",
  },

  toggleText: {
    fontSize: 12,
    fontFamily: "monsterrat_font",
    color: "#2c7a6e",
    fontWeight: "600",
  },

  // ---------- Bottom nav ----------
  row: {
    position: "absolute",
    bottom: 25,
    width: "95%",
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