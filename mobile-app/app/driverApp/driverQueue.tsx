import { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  Pressable
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { usePathname } from "expo-router";
import { WebView } from "react-native-webview";
import { BlurView, BlurTargetView } from "expo-blur";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";

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

type RouteEndpoint = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

type RouteData = {
  bounds_id: number | null;
  kilometer: number | null;
  from: RouteEndpoint;
  to: RouteEndpoint;
} | null;

type DriverData = {
  driver_id: number;
  driver_name: string;
  plate_number: string;
  vehicle_type: string;
  terminal_id: number;
};

type DriverQueueResponse = {
  driver: DriverData;
  route: RouteData;
  queue: QueueItem[];
};


const HUB_FALLBACK = { lat: 6.48409, lng: 124.85211, name: "Koronadal City" };

const COLLAPSED_H_WITH_ME = 245;
const COLLAPSED_H_SOLO    = 168;
const EXPANDED_H          = Math.min(H * 0.55, 460);

// ============================================================
// Leaflet HTML builder
// ============================================================
function buildLeafletHTML(
  myTerminalLat: number | null,
  myTerminalLng: number | null,
  myTerminalName: string | null,
): string {
  const HUB = { lat: 6.484090, lng: 124.852111, name: "Koronadal City" };

  const hasMyTerminal = myTerminalLat != null && myTerminalLng != null;

  const center = hasMyTerminal
    ? {
        lat: (myTerminalLat + HUB.lat) / 2,
        lng: (myTerminalLng + HUB.lng) / 2,
      }
    : { lat: HUB.lat, lng: HUB.lng };

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
    .my-pin { width: 28px; height: 40px; }
    .my-pin svg { width: 100%; height: 100%; }
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
      minZoom: 10,
      maxZoom: 13,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const myLat   = ${myTerminalLat ?? 'null'};
    const myLng   = ${myTerminalLng ?? 'null'};
    const myName  = ${JSON.stringify(myTerminalName || 'Your terminal')};
    const hubLat  = ${HUB.lat};
    const hubLng  = ${HUB.lng};
    const hubName = ${JSON.stringify(HUB.name)};

    L.marker([hubLat, hubLng], {
      icon: L.divIcon({
        className: '',
        html: '<div class="hub-dot"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(map).bindPopup(hubName);

    if (myLat != null && myLng != null) {
      L.marker([myLat, myLng], {
        icon: L.divIcon({
          className: '',
          html:
            '<div class="my-pin">' +
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
      })
        .addTo(map)
        .bindPopup(myName)
        .openPopup();

      const osrmUrl =
        'https://router.project-osrm.org/route/v1/driving/' +
        myLng + ',' + myLat + ';' +
        hubLng + ',' + hubLat +
        '?overview=full&geometries=geojson';

      fetch(osrmUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map(function (c) {
              return [c[1], c[0]];
            });
            const line = L.polyline(coords, {
              color: '#e74c3c',
              weight: 5,
              opacity: 0.9,
            }).addTo(map);

            map.fitBounds(line.getBounds(), { padding: [70, 70] });
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
export default function DriverQueue() {
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
   const { user, token } = useAuth();

  const [queue, setQueue]   = useState<QueueItem[]>([]);
  const [route, setRoute]   = useState<RouteData>(null);
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const mapTargetRef = useRef(null);

  // ============================================================
  // Responsive layout constants
  // ============================================================
  // iOS home indicator   → insets.bottom ≈ 34
  // Android 3-button nav → insets.bottom ≈ 48
  // Android gesture nav  → insets.bottom ≈ 0
  const navHeight       = 56;
  const navGap          = 12;
  const navBottomOffset = Math.max(insets.bottom, 8) + navGap;

  // ---- Derived queue state ----
  const firstInQueue = queue.find((q) => q.queue_position === 1) || null;
  const me           = queue.find((q) => q.driver_id === user?.id) || null;
  const amFirst      = !!me && me.queue_position === 1;

  const showMeCard = !!me && !amFirst;
  const collapsedH = showMeCard ? COLLAPSED_H_WITH_ME : COLLAPSED_H_SOLO;

  const panelHeight = useRef(new Animated.Value(COLLAPSED_H_WITH_ME)).current;

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const load = async () => {
      try {
       const res = await fetch(
          `${API_URL}/api/auth/driverQueue?driver_id=${user.id}`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const json: { success: boolean; data?: DriverQueueResponse; message?: string } =
          await res.json();

        if (!json.success || !json.data) {
          throw new Error(json.message || "Failed to load queue");
        }
        if (cancelled) return;

        setDriver(json.data.driver);
        setRoute(json.data.route);
        setQueue(json.data.queue);
      } catch (err) {
        console.error("driverQueue fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.id]);

  useEffect(() => {
    if (expanded) return;
    Animated.spring(panelHeight, {
      toValue: collapsedH,
      useNativeDriver: false,
      friction: 10,
      tension: 60,
    }).start();
  }, [collapsedH, expanded]);

  const toggleExpanded = () => {
    const to = expanded ? collapsedH : EXPANDED_H;
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

  const routeLabel = route
    ? `Route: ${route.from.name} ↔ ${route.to.name}`
    : user?.terminal_name
      ? `Terminal: ${user.terminal_name}`
      : "Route: —";

  const leafletHTML = buildLeafletHTML(
    user?.terminal_lat ?? null,
    user?.terminal_lng ?? null,
    user?.terminal_name ?? null,
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.root}>

        {/* FULL-SCREEN LEAFLET MAP */}
        <BlurTargetView ref={mapTargetRef} style={StyleSheet.absoluteFill}>
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
        </BlurTargetView>

        {/* EXPANDABLE TOP PANEL WITH BLUR */}
        <Animated.View style={[styles.panel, { height: panelHeight }]}>
          <BlurView
            intensity={100}
            tint="light"
            blurMethod="dimezisBlurView"
            blurTarget={mapTargetRef}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.panelContent}>

            <View style={styles.pageHeader}>
              <Text style={styles.pageTitle}>Driver Queueing</Text>
              <Text style={styles.pageSubtitle}>{routeLabel}</Text>
            </View>

            {!expanded ? (
              <Pressable onPress={toggleExpanded} style={{ flex: 1 }}>
                <View style={styles.cardFirst}>
                  <View style={styles.cardFirstLeft}>
                    <Text style={styles.cardLabelLight}>
                      {amFirst ? "YOU'RE 1ST IN QUEUE" : "1ST IN QUEUE"}
                    </Text>
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

                {showMeCard && me && (
                  <View style={styles.cardMe}>
                    <View style={styles.cardMeLeft}>
                      <Text style={styles.cardLabelBlue}>YOUR POSITION</Text>
                      <Text style={styles.cardNameDark}>{me.driver_name}</Text>
                      <Text style={styles.cardPlateDark}>{me.plate_number}</Text>
                    </View>
                    <View style={styles.mePositionBadge}>
                      <Text style={styles.mePositionNum}>
                        #{me.queue_position}
                      </Text>
                      <Text style={styles.mePositionStatus}>
                        {me.queue_status === "WAITING" ? "Next to depart" : "Waiting"}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>
              </Pressable>
            ) : (
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
                    const isMe = item.driver_id === user?.id;
                    return (
                      <View
                        key={item.queue_id}
                        style={[styles.queueRow, isMe && styles.queueRowMe]}
                      >
                        <View
                          style={[
                            styles.posBadge,
                            idx === 0 && styles.posBadgeFirst,
                            isMe && idx !== 0 && styles.posBadgeMe,
                          ]}
                        >
                          <Text style={styles.posText}>#{item.queue_position}</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.plate} numberOfLines={1}>
                            {item.plate_number}
                            <Text style={styles.name}>  {item.driver_name}</Text>
                            {isMe && <Text style={styles.youTag}>  • You</Text>}
                          </Text>
                          <Text style={styles.vType} numberOfLines={1}>
                            {item.vehicle_type}
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

        {/* BOTTOM NAV — responsive to OS nav zone */}
        <View
          style={[
            styles.row,
            { bottom: navBottomOffset },
          ]}
        >
          <GridNavButton
            title="Dashboard"
            route="./driverDashboard"
            icon="view-dashboard-outline"
            active={pathname === "/driverApp/driverDashboard"}
          />
          <GridNavButton
            title="Vehicles"
            route="./driverQueue"
            icon="van-passenger"
            active={pathname === "/driverApp/driverQueue"}
          />
          <GridNavButton
            title="Fares"
            route="./driverFareprices"
            icon="cash-multiple"
            active={pathname === "/driverApp/driverFareprices"}
          />
          <GridNavButton
            title="Profile"
            route="./driverProfile"
            icon="account-circle"
            active={pathname === "/driverApp/driverProfile"}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  root: { flex: 1, backgroundColor: "#e9efe9" },

  panel: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    zIndex: 10,
    backgroundColor: "transparent",
  },
  panelContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },

  pageHeader: { marginBottom: 12, paddingHorizontal: 4 },
  pageTitle: {
    fontSize: 22, fontFamily: "monsterrat_kp",
    color: "#1a1a1a", marginBottom: 2,
  },
  pageSubtitle: {
    fontSize: 12, fontFamily: "monster_act", color: "#5c7e76",
  },

  cardFirst: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#2c7a6e", borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 8,
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

  cardMe: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#d7ebff", borderRadius: 16,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: "#7eb6f2",
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

  handleWrap: { alignItems: "center", paddingVertical: 8 },
  handle: {
    width: 42, height: 4, borderRadius: 2, backgroundColor: "#c8d4d0",
  },

  listContent: { paddingTop: 2, paddingBottom: 6 },
  listHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-end", marginBottom: 6, paddingHorizontal: 4,
  },
  listTitle: { fontSize: 13, fontFamily: "monsterrat_kp", color: "#1a1a1a" },
  listCount: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },

  queueRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(247, 251, 250, 0.94)",
    borderRadius: 12,
    paddingVertical: 6, paddingHorizontal: 10,
    marginBottom: 5, borderWidth: 1, borderColor: "#e2f0ec",
  },
  queueRowMe: {
    backgroundColor: "rgba(234, 246, 255, 0.94)",
    borderColor: "#7eb6f2", borderWidth: 1.5,
  },
  plate: { fontSize: 13, fontFamily: "digitalFont", color: "#2c7a6e" },
  name: { fontSize: 11, fontFamily: "monster_act", color: "#1a1a1a" },
  youTag: { fontSize: 11, color: "#2c7a6e", fontFamily: "monsterrat_font", fontWeight: "700" },
  vType: { fontSize: 10, fontFamily: "monster_act", color: "#7f9f97", marginTop: 1 },
  posBadge: {
    backgroundColor: "#2c7a6e", borderRadius: 12,
    minWidth: 38, alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 3,
  },
  posBadgeFirst: { backgroundColor: "#D85A30" },
  posBadgeMe: { backgroundColor: "#2a7be4" },
  posText: { color: "#fff", fontSize: 11, fontFamily: "monsterrat_kp", fontWeight: "bold" },
  status: {
    fontSize: 10, fontFamily: "monsterrat_font", fontWeight: "600",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, overflow: "hidden",
  },
  statusReady: { backgroundColor: "#e0f2e9", color: "#1e6f4c" },
  statusOther: { backgroundColor: "#fff0db", color: "#c97e00" },

  // NOTE: `bottom` is applied dynamically via insets — see JSX
  row: {
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
    zIndex: 20,
  },
});