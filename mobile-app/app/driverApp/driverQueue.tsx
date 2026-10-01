import { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { usePathname } from "expo-router";
import { WebView } from "react-native-webview";
import { BlurView } from "expo-blur";
import GridNavButton from "../components/GridNavButton";

const { height: H } = Dimensions.get("window");

// ---------- Types ----------
type QueueItem = {
  queue_id: number;
  driver_id: number;
  plate_number: string;
  driver_name: string;
  vehicle_type: string;
  queue_position: number;
  queue_status: "WAITING" | "QUEUED";
};

// ---------- Placeholder data ----------
const FALLBACK_QUEUE: QueueItem[] = [
  { queue_id: 1, driver_id: 12, plate_number: "KGA-1234", driver_name: "Ramon Dela Cruz",    vehicle_type: "Van",         queue_position: 1, queue_status: "WAITING" },
  { queue_id: 2, driver_id: 9,  plate_number: "KGA-5678", driver_name: "Maria Santos",       vehicle_type: "Van",         queue_position: 2, queue_status: "QUEUED"  },
  { queue_id: 3, driver_id: 10, plate_number: "KGA-9101", driver_name: "Jake Sarmiento",     vehicle_type: "Minibus",     queue_position: 3, queue_status: "QUEUED"  },
  { queue_id: 4, driver_id: 11, plate_number: "KGA-1122", driver_name: "Luzviminda Ortigas", vehicle_type: "Van",         queue_position: 4, queue_status: "QUEUED"  },
  { queue_id: 5, driver_id: 13, plate_number: "KGA-3344", driver_name: "Edwin Magbanua",     vehicle_type: "Modern Jeep", queue_position: 5, queue_status: "QUEUED"  },
];

const CURRENT_DRIVER_ID = 9;

const TERMINAL = {
  latitude: 6.406392585980692,
  longitude: 124.80452341672029,
  name: "Koronadal Terminal",
};

// ---------- Panel heights ----------
const COLLAPSED_H = 175;
const EXPANDED_H  = H * 0.85;

// ============================================================
// Leaflet HTML builder
// ============================================================
function buildLeafletHTML(queue: QueueItem[]): string {
  const markers = queue.map((q) => ({
    lat: TERMINAL.latitude  + (Math.random() - 0.5) * 0.0018,
    lng: TERMINAL.longitude + (Math.random() - 0.5) * 0.0018,
    label: `${q.driver_name} • #${q.queue_position}`,
    plate: q.plate_number,
    status: q.queue_status,
    isMe: q.driver_id === CURRENT_DRIVER_ID,
  }));

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
    .terminal-dot {
      width: 20px; height: 20px; border-radius: 50%;
      background: #2c7a6e; border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    }
    .driver-dot {
      width: 16px; height: 16px; border-radius: 50%;
      background: #7eb6f2; border: 2px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .driver-dot.me { background: #2c7a6e; }
    .driver-dot.first { background: #D85A30; }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
    }).setView([${TERMINAL.latitude}, ${TERMINAL.longitude}], 18);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    L.marker([${TERMINAL.latitude}, ${TERMINAL.longitude}], {
      icon: L.divIcon({
        className: '',
        html: '<div class="terminal-dot"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(map).bindPopup(${JSON.stringify(TERMINAL.name)});

    const drivers = ${JSON.stringify(markers)};

    drivers.forEach(function (d) {
      const cls = d.isMe ? 'me' : (d.status === 'WAITING' ? 'first' : '');

      L.marker([d.lat, d.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="driver-dot ' + cls + '"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(map).bindPopup(
        '<b>' + d.label + '</b><br>' + d.plate
      );
    });
  </script>
</body>
</html>
  `.trim();
}

// ============================================================
// Main component
// ============================================================
export default function DriverQueue() {
  const pathname = usePathname();
  const [queue] = useState<QueueItem[]>(FALLBACK_QUEUE);
  const [expanded, setExpanded] = useState(false);

  const panelHeight = useRef(new Animated.Value(COLLAPSED_H)).current;

  const toggleExpanded = () => {
    const to = expanded ? COLLAPSED_H : EXPANDED_H;
    setExpanded(!expanded);
    Animated.spring(panelHeight, {
      toValue: to,
      useNativeDriver: false,
      friction: 10,
      tension: 60,
    }).start();
  };

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../../assets/Font/monster_act.ttf"),
    digitalFont: require("../../assets/Font/digitalFont.ttf"),
  });

  if (!fontsLoaded) return null;

  const firstInQueue = queue.find((q) => q.queue_position === 1) || null;
  const me = queue.find((q) => q.driver_id === CURRENT_DRIVER_ID) || null;

  const leafletHTML = buildLeafletHTML(queue);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.root}>

        {/* ============================================================
            FULL-SCREEN LEAFLET MAP (WebView)
        ============================================================ */}
        <View style={StyleSheet.absoluteFill}>
          <WebView
            originWhitelist={["*"]}
            source={{ html: leafletHTML }}
            style={{ flex: 1, backgroundColor: "#e9efe9" }}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
          />
        </View>

        {/* ============================================================
            EXPANDABLE TOP PANEL WITH BLUR
        ============================================================ */}
        <Animated.View style={[styles.panel, { height: panelHeight }]}>
          {/* Blurred backdrop — sits between the map and the content */}
          <BlurView
              intensity={100}
              tint="light"
              blurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />

          {/* Content on top of the blur */}
          <View style={styles.panelContent}>
            {!expanded ? (
              /* ---------------- COLLAPSED VIEW ---------------- */
              <Pressable onPress={toggleExpanded} style={{ flex: 1 }}>
                {/* Card 1 — 1st in queue */}
                <View style={styles.cardFirst}>
                  <View style={styles.cardFirstLeft}>
                    <Text style={styles.cardLabelLight}>1ST IN QUEUE</Text>
                    <Text style={styles.cardNameLight}>
                      {firstInQueue ? firstInQueue.driver_name : "Queue empty"}
                    </Text>
                    <Text style={styles.cardPlateLight}>
                      {firstInQueue ? firstInQueue.plate_number : "—"}
                    </Text>
                  </View>
                  <View style={styles.crownBadge}>
                    <Ionicons name="trophy" size={18} color="#fff" />
                  </View>
                </View>

                {/* Card 2 — my position */}
                <View style={[styles.cardMe, !me && styles.cardMeInactive]}>
                  <View style={styles.cardMeLeft}>
                    <Text style={styles.cardLabelBlue}>YOUR POSITION</Text>
                    <Text style={styles.cardNameDark}>
                      {me ? me.driver_name : "Not in queue"}
                    </Text>
                    <Text style={styles.cardPlateDark}>
                      {me ? me.plate_number : "—"}
                    </Text>
                  </View>
                  <View style={styles.mePositionBadge}>
                    <Text style={styles.mePositionNum}>
                      {me ? `#${me.queue_position}` : "—"}
                    </Text>
                    <Text style={styles.mePositionStatus}>
                      {me
                        ? me.queue_status === "WAITING"
                          ? "Next to depart"
                          : "Waiting"
                        : "Join a zone"}
                    </Text>
                  </View>
                </View>

                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>
              </Pressable>
            ) : (
              /* ---------------- EXPANDED VIEW ---------------- */
              <View style={{ flex: 1 }}>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.listHeader}>
                    <Text style={styles.listTitle}>All queued drivers</Text>
                    <Text style={styles.listCount}>{queue.length} in queue</Text>
                  </View>

                  {queue.map((item, idx) => {
                    const isMe = item.driver_id === CURRENT_DRIVER_ID;
                    return (
                      <View
                        key={item.queue_id}
                        style={[styles.queueCard, isMe && styles.queueCardMe]}
                      >
                        <View style={[styles.avatar, isMe && styles.avatarMe]}>
                          <Ionicons
                            name={isMe ? "person" : "person-outline"}
                            size={22}
                            color={isMe ? "#fff" : "#5c7e76"}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.plate}>{item.plate_number}</Text>
                          <Text style={styles.name}>
                            {item.driver_name}{" "}
                            {isMe && <Text style={styles.youTag}>• You</Text>}
                          </Text>
                          <Text style={styles.vType}>{item.vehicle_type}</Text>
                        </View>

                        <View style={styles.rightCol}>
                          <View
                            style={[
                              styles.posBadge,
                              idx === 0 && styles.posBadgeFirst,
                            ]}
                          >
                            <Text style={styles.posText}>
                              #{item.queue_position}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.status,
                              idx === 0 ? styles.statusReady : styles.statusOther,
                            ]}
                          >
                            {idx === 0 ? "Next" : "Waiting"}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <Pressable onPress={toggleExpanded}>
                  <View style={styles.handleWrap}>
                    <View style={styles.handle} />
                  </View>
                </Pressable>
              </View>
            )}
          </View>
        </Animated.View>

        {/* ============================================================
            BOTTOM NAV
        ============================================================ */}
        <View style={styles.row}>
          <GridNavButton title="Dashboard"   route="./driverDashboard"  icon="view-dashboard-outline" />
          <GridNavButton title="Map routes"  route="./driverRoute"      icon="map-marker-path" />
          <GridNavButton title="Fare prices" route="./driverFareprices" icon="cash-multiple" />
          <GridNavButton title="Vehicles"    route="./driverQueue"      icon="van-passenger" active={pathname === "/driverApp/driverQueue"} />
          <GridNavButton title="Profile"     route="./driverProfile"    icon="account-circle" />
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#2c7a6e" },
  root: { flex: 1, backgroundColor: "#e9efe9" },

  // ============================================================
  // Panel — outer container (handles height animation, rounding,
  // shadow). No backgroundColor — BlurView provides the backdrop.
  // ============================================================
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    zIndex: 10,
    backgroundColor: "transparent",
    shadowColor: "#ece4e4c1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,

    // Fallback for Android < 12 (no native blur support) —
    // semi-transparent white so the panel is still readable.
    
  },

  // Content layer on top of the blur
  panelContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },

  // ============================================================
  // Card 1 — 1st in queue
  // ============================================================
  cardFirst: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2c7a6e",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 3,
  },
  cardFirstLeft: { flex: 1 },
  cardLabelLight: {
    fontSize: 9, letterSpacing: 1.3, fontFamily: "monsterrat_font",
    fontWeight: "700", color: "rgba(255,255,255,0.75)", marginBottom: 2,
  },
  cardNameLight: {
    fontSize: 15, fontFamily: "monsterrat_kp", color: "#fff", marginBottom: 1,
  },
  cardPlateLight: {
    fontSize: 12, fontFamily: "digitalFont", color: "#c8e0da",
  },
  crownBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },

  // ============================================================
  // Card 2 — my position
  // ============================================================
  cardMe: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#d7ebff", borderRadius: 16,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: "#7eb6f2",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  cardMeInactive: { backgroundColor: "#fff7e6", borderColor: "#e6c98c" },
  cardMeLeft: { flex: 1 },
  cardLabelBlue: {
    fontSize: 9, letterSpacing: 1.3, fontFamily: "monsterrat_font",
    fontWeight: "700", color: "#3a608a", marginBottom: 2,
  },
  cardNameDark: {
    fontSize: 13, fontFamily: "monsterrat_kp", color: "#1a1a1a", marginBottom: 1,
  },
  cardPlateDark: {
    fontSize: 11, fontFamily: "digitalFont", color: "#5c7e76",
  },
  mePositionBadge: {
    alignItems: "center", backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6, minWidth: 78,
  },
  mePositionNum: {
    fontSize: 18, fontFamily: "digitalFont",
    color: "#2c7a6e", fontWeight: "bold",
  },
  mePositionStatus: {
    fontSize: 9, fontFamily: "monsterrat_font",
    color: "#2c7a6e", marginTop: 1,
  },

  // ============================================================
  // Drag handle
  // ============================================================
  handleWrap: { alignItems: "center", paddingVertical: 10 },
  handle: {
    width: 42, height: 4, borderRadius: 2, backgroundColor: "#c8d4d0",
  },

  // ============================================================
  // Expanded list
  // ============================================================
  listContent: { paddingTop: 6, paddingBottom: 10 },
  listHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-end", marginBottom: 10, paddingHorizontal: 4,
  },
  listTitle: { fontSize: 14, fontFamily: "monsterrat_kp", color: "#1a1a1a" },
  listCount: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },

  queueCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(247, 251, 250, 0.94)",
    borderRadius: 14, padding: 10,
    marginBottom: 8, borderWidth: 1, borderColor: "#e2f0ec",
  },
  queueCardMe: {
    backgroundColor: "rgba(234, 246, 255, 0.94)",
    borderColor: "#7eb6f2", borderWidth: 1.5,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#e6f0ed", alignItems: "center", justifyContent: "center",
    marginRight: 10, borderWidth: 1, borderColor: "#c8e0da",
  },
  avatarMe: { backgroundColor: "#2c7a6e", borderColor: "#2c7a6e" },
  plate: { fontSize: 14, fontFamily: "digitalFont", color: "#2c7a6e", marginBottom: 1 },
  name: { fontSize: 12, fontFamily: "monster_act", color: "#1a1a1a", marginBottom: 1 },
  youTag: { color: "#2c7a6e", fontFamily: "monsterrat_font", fontWeight: "700" },
  vType: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },
  rightCol: { alignItems: "flex-end", gap: 4 },
  posBadge: {
    backgroundColor: "#2c7a6e", borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 2,
  },
  posBadgeFirst: { backgroundColor: "#D85A30" },
  posText: { color: "#fff", fontSize: 11, fontFamily: "monsterrat_kp", fontWeight: "bold" },
  status: {
    fontSize: 10, fontFamily: "monsterrat_font", fontWeight: "600",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, overflow: "hidden",
  },
  statusReady: { backgroundColor: "#e0f2e9", color: "#1e6f4c" },
  statusOther: { backgroundColor: "#fff0db", color: "#c97e00" },

  // ============================================================
  // Bottom nav
  // ============================================================
  row: {
    position: "absolute", bottom: 25, width: "90%", alignSelf: "center",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, borderRadius: 24, height: 46,
    backgroundColor: "rgba(233, 233, 233, 0.94)",
    borderWidth: 0.8, borderColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 6, zIndex: 20,
  },
});