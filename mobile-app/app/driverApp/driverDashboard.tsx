import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { io, Socket } from "socket.io-client";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";

type BackendStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";

export default function DriverDashboard() {
  const { user, token } = useAuth();
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();

  const [backendStatus, setBackendStatus] = useState<BackendStatus>("UNKNOWN");
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [earningsInput, setEarningsInput] = useState("");
  const [tripsToday, setTripsToday] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const isOnline = backendStatus === "ACTIVE";

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../../assets/Font/monster_act.ttf"),
    digitalFont: require("../../assets/Font/digitalFont.ttf"),
  });

  // ============================================================
  // Responsive layout constants
  // ============================================================
  const navHeight       = 56;
  const navGap          = 12;
  const navBottomOffset = Math.max(insets.bottom, 8) + navGap;
  const navTotalSpace   = navBottomOffset + navHeight + 12;

  // Resolve driver id the same way the queue endpoint expects
  const driverId =
    (user as any)?.driverId ||
    (user as any)?.driver_id ||
    (user as any)?.id;

  // ============================================================
  // Fetch today's trips from the backend
  // ============================================================
  const fetchStats = async () => {
    if (!driverId) return;
    try {
      const res = await fetch(
        `${API_URL}/api/auth/driverStats?driver_id=${driverId}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Guard against HTML error pages (e.g. 404 page from Express)
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.warn(
          "[dashboard] driverStats returned non-JSON:",
          res.status,
          contentType
        );
        return;
      }

      const json = await res.json();
      if (json.success) {
        setTripsToday(json.data.tripsToday || 0);
      }
    } catch (e) {
      console.warn("[dashboard] stats fetch failed:", e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [driverId]);

  // ============================================================
  // SOCKET + GPS WATCHER
  // ============================================================
  useEffect(() => {
    let mounted = true;

    if (!driverId) {
      setGpsError("Missing driver ID — please log in again.");
      return;
    }

    (async () => {
      const socket = io(API_URL, { transports: ["websocket"] });
      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("[driver] socket connected");
      });

      socket.on("disconnect", () => {
        if (!mounted) return;
        setBackendStatus("UNKNOWN");
      });

      socket.on("driver:status", (payload: { status: string }) => {
        if (!mounted) return;
        const s = (payload?.status || "").toUpperCase();
        setBackendStatus(s === "ACTIVE" ? "ACTIVE" : "INACTIVE");
      });

      socket.on("queue:joined", () => {
        if (!mounted) return;
        setBackendStatus("ACTIVE");
      });

      socket.on("queue:left", () => {
        if (!mounted) return;
        setBackendStatus("INACTIVE");
      });

      socket.on("queue:join:error", ({ message }: { message: string }) => {
        console.warn("[driver] queue join error:", message);
      });

      socket.on("trip:started", (data: any) => {
        console.log("[driver] trip started:", data);
        if (!mounted) return;
        // Trip was just logged on the backend — refresh the daily count
        fetchStats();
      });

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!mounted) return;
        setGpsError("Location permission denied. Enable it to go online.");
        return;
      }

      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000,
            distanceInterval: 5,
          },
          (pos) => {
            if (!mounted) return;
            setGpsReady(true);
            const { latitude, longitude } = pos.coords;
            socket.emit("location:update", {
              driverId,
              latitude,
              longitude,
            });
          }
        );
        locationSubRef.current = sub;
      } catch (e: any) {
        if (!mounted) return;
        setGpsError(e?.message || "Failed to start GPS.");
      }
    })();

    return () => {
      mounted = false;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [driverId]);

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
    : "Driver Partner";

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const earnings = parseFloat(earningsInput) || 0;
  const target = 2500;
  const earningsProgress = Math.min(earnings / target, 1);
  const remaining = Math.max(target - earnings, 0);

  // TODO: replace queue + vehicle with real data later
  const queue = { position: 3, total: 12, etaMin: 12 };
  const vehicle = {
    plate: "ABC 1234",
    model: "Toyota Hiace UV Express",
    capacity: 14,
    status: "Active",
  };

  const avgPerTrip = tripsToday > 0 ? Math.round(earnings / tripsToday) : 0;
  const driversAhead = Math.max(queue.position - 1, 0);
  const queueProgress = (queue.total - queue.position + 1) / queue.total;
  const isNext = isOnline && queue.position === 1;

  // ============================================================
  // Status display
  // ============================================================
  const statusLabel = () => {
    if (gpsError) return "GPS ERROR";
    if (!gpsReady) return "LOCATING…";
    if (backendStatus === "ACTIVE") return "ACTIVE";
    if (backendStatus === "INACTIVE") return "INACTIVE";
    return "CHECKING…";
  };

  const statusHeadline = () => {
    if (gpsError) return "Location required";
    if (!gpsReady) return "Finding you…";
    if (backendStatus === "ACTIVE") return "You're in queue";
    if (backendStatus === "INACTIVE") return "Outside queue area";
    return "INACTIVE";
  };

  const statusColor = () => {
    if (gpsError)
      return { bg: "rgba(220,38,38,0.14)", dot: "#DC2626", text: "#B91C1C" };
    if (backendStatus === "ACTIVE")
      return { bg: "rgba(22,163,74,0.14)", dot: "#16A34A", text: "#15803D" };
    return { bg: "rgba(100,116,139,0.14)", dot: "#64748B", text: "#475569" };
  };

  const statusSubtext = () => {
    if (gpsError) return gpsError;
    if (!gpsReady) return "Acquiring GPS signal…";
    if (backendStatus === "ACTIVE")
      return "You are counted in the queue";
    if (backendStatus === "INACTIVE")
      return "Move inside the terminal zone to join";
    return "Verifying location…";
  };

  const colors = statusColor();

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ImageBackground
        source={require("../../assets/images/main-bg.png")}
        style={styles.bgImage}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1 ── HEADER */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>{getGreeting()}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.avatarButton}
                activeOpacity={0.7}
                onPress={() => router.push("./driverProfile")}
              >
                <MaterialCommunityIcons
                  name="account"
                  size={22}
                  color="#1f6f66"
                />
              </TouchableOpacity>
            </View>

            {/* 2 ── STATUS HERO */}
            <BlurView intensity={45} tint="light" style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View
                  style={[styles.statusPill, { backgroundColor: colors.bg }]}
                >
                  {!gpsReady && !gpsError ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.dot}
                      style={{ marginRight: 6 }}
                    />
                  ) : (
                    <View
                      style={[styles.statusDot, { backgroundColor: colors.dot }]}
                    />
                  )}
                  <Text style={[styles.statusPillText, { color: colors.text }]}>
                    {statusLabel()}
                  </Text>
                </View>
                <Text style={styles.heroHint} numberOfLines={2}>
                  {statusSubtext()}
                </Text>
              </View>

              <View style={styles.statusBlock}>
                <Text style={styles.statusBlockLabel}>CURRENT STATUS</Text>
                <Text
                  style={[
                    styles.statusBlockValue,
                    { color: isOnline ? "#1f6f66" : "#64748B" },
                  ]}
                  numberOfLines={1}
                >
                  {statusHeadline()}
                </Text>
              </View>

              <View style={styles.heroBottomRow}>
                <View style={styles.heroMetaItem}>
                  <MaterialCommunityIcons
                    name="map-marker-radius"
                    size={13}
                    color="#7f9f97"
                  />
                  <Text style={styles.heroMetaText}>
                    {isOnline ? "In queue zone" : "Outside zone"}
                  </Text>
                </View>
                <View style={styles.heroMetaItem}>
                  <MaterialCommunityIcons
                    name="signal"
                    size={13}
                    color="#7f9f97"
                  />
                  <Text style={styles.heroMetaText}>
                    {gpsReady ? "GPS locked" : "No GPS"}
                  </Text>
                </View>
              </View>
            </BlurView>

            {/* 3 ── QUEUE */}
            <BlurView intensity={40} tint="light" style={styles.glassCard}>
              <View style={styles.queueHeader}>
                <Text style={styles.cardLabel}>Your queue</Text>
                {isNext && (
                  <View style={styles.nextPill}>
                    <Text style={styles.nextPillText}>You're next</Text>
                  </View>
                )}
              </View>

              {isOnline ? (
                <>
                  <View style={styles.queueMainRow}>
                    <View style={styles.queueBlock}>
                      <Text style={styles.queueBig}>#{queue.position}</Text>
                      <Text style={styles.queueSub}>of {queue.total} drivers</Text>
                    </View>

                    <View style={styles.queueSeparator} />

                    <View style={styles.queueBlock}>
                      <View style={styles.etaRow}>
                        <MaterialCommunityIcons
                          name="clock-fast"
                          size={18}
                          color="#D97706"
                        />
                        <Text style={styles.queueBig}>{queue.etaMin}</Text>
                        <Text style={styles.queueUnit}>min</Text>
                      </View>
                      <Text style={styles.queueSub}>est. wait</Text>
                    </View>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${queueProgress * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressHint}>
                    {driversAhead === 0
                      ? "No one ahead of you"
                      : `${driversAhead} ${
                          driversAhead === 1 ? "driver" : "drivers"
                        } ahead of you`}
                  </Text>
                </>
              ) : (
                <View style={styles.queueEmpty}>
                  <MaterialCommunityIcons
                    name="account-group-outline"
                    size={26}
                    color="#b5c4c0"
                  />
                  <Text style={styles.queueEmptyText}>
                    You're not in the queue. Enter the terminal zone to join.
                  </Text>
                </View>
              )}
            </BlurView>

            {/* 4 ── VEHICLE */}
            <BlurView intensity={40} tint="light" style={styles.vehicleCard}>
              <View style={styles.vehicleIconWrap}>
                <MaterialCommunityIcons
                  name="van-passenger"
                  size={20}
                  color="#319086"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleModel} numberOfLines={1}>
                  {vehicle.model}
                </Text>
                <Text style={styles.vehiclePlate}>
                  {vehicle.plate} • {vehicle.capacity} seats
                </Text>
              </View>

              <View style={styles.vehicleStatusPill}>
                <View style={styles.vehicleStatusDot} />
                <Text style={styles.vehicleStatusText}>{vehicle.status}</Text>
              </View>
            </BlurView>

            {/* 5 ── TODAY */}
            <BlurView intensity={40} tint="light" style={styles.glassCard}>
              <View style={styles.earningsHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardLabel}>Today</Text>
                  <Text style={styles.earningsSubtext}>
                    Enter your total income so far
                  </Text>
                </View>
                <View style={styles.targetPill}>
                  <Text style={styles.targetText}>
                    Goal ₱{target.toLocaleString()}
                  </Text>
                </View>
              </View>

              <View style={styles.earningsInputRow}>
                <Text style={styles.earningsCurrency}>₱</Text>
                <TextInput
                  style={styles.earningsInput}
                  value={earningsInput}
                  onChangeText={(t) =>
                    setEarningsInput(t.replace(/[^0-9.]/g, ""))
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#b5c4c0"
                  returnKeyType="done"
                />
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${earningsProgress * 100}%` },
                  ]}
                />
              </View>

              <View style={styles.progressMeta}>
                <Text style={styles.progressHint}>
                  {Math.round(earningsProgress * 100)}% of daily goal
                </Text>
                <Text style={styles.progressHint}>
                  {remaining > 0
                    ? `₱${remaining.toLocaleString()} to go`
                    : "Goal reached 🎉"}
                </Text>
              </View>

              <View style={styles.todayDivider} />

              <View style={styles.todayStatsRow}>
                <View style={styles.todayStat}>
                  <MaterialCommunityIcons
                    name="car"
                    size={18}
                    color="#319086"
                  />
                  <View>
                    <Text style={styles.todayStatValue}>{tripsToday}</Text>
                    <Text style={styles.todayStatLabel}>Trips today</Text>
                  </View>
                </View>
                <View style={styles.todayStat}>
                  <MaterialCommunityIcons
                    name="cash"
                    size={18}
                    color="#319086"
                  />
                  <View>
                    <Text style={styles.todayStatValue}>
                      ₱{avgPerTrip.toLocaleString()}
                    </Text>
                    <Text style={styles.todayStatLabel}>Avg per trip</Text>
                  </View>
                </View>
              </View>
            </BlurView>

            <View style={{ height: navTotalSpace }} />
          </ScrollView>

          {/* ===== BOTTOM NAV ===== */}
          <View
            style={[
              styles.bottomBar,
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
      </ImageBackground>
    </SafeAreaView>
  );
}

const CARD_BG = "rgba(255, 255, 255, 0.72)";
const CARD_BORDER = "rgba(233, 240, 238, 0.6)";

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  bgImage: { flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(255, 255, 255, 0.38)" },
  container: { paddingHorizontal: 16, paddingTop: 10 },

  // ---------- header ----------
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  greeting: {
    fontSize: 11,
    fontFamily: "monsterrat_font",
    color: "#7f9f97",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  name: {
    fontSize: 20,
    fontFamily: "monsterrat_kp",
    color: "#1f6f66",
    marginTop: 2,
  },
  avatarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(233,240,238,0.9)",
  },

  // ---------- hero (status only) ----------
  heroCard: {
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.7)",
    overflow: "hidden",
    backgroundColor: CARD_BG,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  statusPillText: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  heroHint: {
    fontSize: 10,
    fontFamily: "monster_act",
    color: "#7f9f97",
    flexShrink: 1,
    textAlign: "right",
  },

  // ---------- big status display ----------
  statusBlock: {
    alignItems: "center",
    paddingVertical: 20,
  },
  statusBlockLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  statusBlockValue: {
    fontSize: 30,
    fontFamily: "monsterrat_kp",
    letterSpacing: 0.5,
    textAlign: "center",
  },

  heroBottomRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroMetaText: { fontSize: 10, fontFamily: "monster_act", color: "#7f9f97" },

  // ---------- generic glass card ----------
  glassCard: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: "hidden",
  },
  cardLabel: {
    fontSize: 12,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#4b6f68",
    letterSpacing: 0.3,
  },

  // ---------- queue ----------
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  nextPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(22,163,74,0.14)",
  },
  nextPillText: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#15803D",
  },
  queueMainRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  queueBlock: { flex: 1, alignItems: "center", gap: 2 },
  queueSeparator: {
    width: 1,
    height: 48,
    backgroundColor: "rgba(233,240,238,0.9)",
  },
  queueBig: {
    fontSize: 34,
    fontFamily: "digitalFont",
    color: "#1f3d38",
    letterSpacing: 1,
  },
  queueUnit: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#7f9f97",
    alignSelf: "flex-end",
    marginBottom: 6,
  },
  etaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  queueSub: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },
  queueEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  queueEmptyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#475569",
  },

  // ---------- earnings / today ----------
  earningsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    gap: 8,
  },
  earningsSubtext: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#334155",
    marginTop: 3,
  },
  targetPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(233,240,238,0.9)",
  },
  targetText: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 0.4,
  },
  earningsInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(49,144,134,0.22)",
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  earningsCurrency: {
    fontSize: 22,
    fontFamily: "digitalFont",
    color: "#1f6f66",
    marginRight: 8,
  },
  earningsInput: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: "digitalFont",
    fontSize: 24,
    color: "#1f6f66",
    letterSpacing: 1,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(49,144,134,0.15)",
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#319086",
  },
  progressMeta: { flexDirection: "row", justifyContent: "space-between" },
  progressHint: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },
  todayDivider: {
    height: 1,
    backgroundColor: "rgba(233,240,238,0.9)",
    marginVertical: 14,
  },
  todayStatsRow: { flexDirection: "row", gap: 12 },
  todayStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  todayStatValue: {
    fontSize: 17,
    fontFamily: "digitalFont",
    color: "#1f3d38",
    letterSpacing: 0.5,
  },
  todayStatLabel: { fontSize: 11, fontFamily: "monster_act", color: "#7f9f97" },

  // ---------- vehicle ----------
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: "hidden",
  },
  vehicleIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49,144,134,0.12)",
  },
  vehicleModel: { fontSize: 13, fontFamily: "monsterrat_kp", color: "#1f3d38" },
  vehiclePlate: {
    fontSize: 11,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginTop: 2,
  },
  vehicleStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(22,163,74,0.14)",
  },
  vehicleStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
  vehicleStatusText: {
    fontSize: 9,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#15803D",
    letterSpacing: 0.6,
  },

  // ---------- bottom nav ----------
  bottomBar: {
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