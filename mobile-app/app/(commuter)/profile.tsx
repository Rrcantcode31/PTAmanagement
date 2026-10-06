import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ImageBackground, StatusBar, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";
// ---------- Light palette (matches FarePrices) ----------
const C = {
  teal: "#319086",
  tealDark: "#1f6f66",
  tealDeep: "#23786f",
  text: "#1f3d38",
  sub: "#2d2d2b81",
  muted: "#7f9f97",
  cardBg: "rgba(255, 255, 255, 0.72)",
  cardBorder: "rgba(233, 240, 238, 0.44)",
  rowAlt: "rgba(237, 246, 243, 0.5)",
  divider: "rgba(217, 230, 227, 0.9)",
  // fare category accents
  green: "#2c7a6e",
  blue: "#1e88e5",
  purple: "#8e44ad",
  orange: "#e67e22",
  red: "#e74c3c",
};

// Map the user's role to a friendly fare category label
function getFareCategory(role: string | undefined) {
  if (!role) return { label: "Regular", short: "Regular", color: C.green };

  const r = role.toLowerCase();
  if (r.includes("student")) return { label: "Student", short: "Student", color: C.blue };
  if (r.includes("senior"))  return { label: "Senior Citizen", short: "Senior", color: C.purple };
  if (r.includes("pwd"))     return { label: "PWD", short: "PWD", color: C.orange };
  return { label: "Regular", short: "Regular", color: C.green };
}

export default function Profile() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../../assets/Font/monster_act.ttf"),
    digitalFont: require("../../assets/Font/digitalFont.ttf"),
  });


  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Commuter"
    : "Commuter";

  const initials = user
    ? `${(user.firstName || "?").charAt(0)}${(user.lastName || "?").charAt(0)}`.toUpperCase()
    : "?";

  const fareCategory = getFareCategory(user?.role);
  const isDriver = user?.type === "driver";

  // Broker-style account number
  const rawId = (user as any)?.accountId ?? (user as any)?.id ?? "";
  const accountId = rawId ? String(rawId).slice(-6).toUpperCase() : "000000";

  // ---- Logout with confirmation ----
  const handleLogout = () => {
    Alert.alert(
      "Log out",
      "Are you sure you want to log out of your account?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: async () => {
            try {
              await logout();
            } catch (e) {
              console.warn("[profile] logout error:", e);
            }
            router.replace("/");
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ImageBackground
        source={require("../../assets/images/main-bg.png")}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          >

            {/* ===== HEADER CARD ===== */}
            <View style={styles.headerCard}>
              <Text style={styles.welcome}>Profile</Text>
              <Text style={styles.noticeBrand}>
                Your commuter account details, fare category, and quick actions.
              </Text>
            </View>

            {/* ===== HERO / ACCOUNT CARD ===== */}
            <View style={styles.heroCard}>
              <BlurView intensity={40} tint="light" style={styles.blurFill}>
                <View style={styles.heroTop}>
                  <View style={[styles.avatarRing, { borderColor: fareCategory.color + "66" }]}>
                    <View style={[styles.avatar, { backgroundColor: fareCategory.color }]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {displayName}
                      </Text>
                      {user ? (
                        <Ionicons name="checkmark-circle" size={15} color={C.teal} />
                      ) : null}
                    </View>

                    <Text style={styles.email} numberOfLines={1}>
                      {user?.email || "Not signed in"}
                    </Text>

                    <View style={styles.idPill}>
                      <Ionicons name="id-card-outline" size={11} color={C.muted} />
                      <Text style={styles.idText}>ID • {accountId}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.heroDivider} />

                {/* Stat tiles */}
                <View style={styles.statsRow}>
                  <Stat label="FARE" value={fareCategory.short} color={fareCategory.color} />
                  <View style={styles.statSep} />
                  <Stat label="TYPE" value={isDriver ? "Driver" : "Commuter"} color={C.blue} />
                  <View style={styles.statSep} />
                  <Stat label="STATUS" value={user ? "Active" : "Guest"} color={user ? C.teal : C.muted} />
                </View>
              </BlurView>
            </View>

            {/* ===== SECTION: ACCOUNT ===== */}
            <Text style={styles.sectionLabel}>ACCOUNT</Text>
            <View style={styles.card}>
              <ProfileRow icon="person-outline" label="Full Name" value={displayName} />
              <Divider />
              <ProfileRow icon="mail-outline" label="Email" value={user?.email || "—"} />
              <Divider />
              <ProfileRow
                icon="card-outline"
                label="Fare Category"
                value={fareCategory.label}
                valueColor={fareCategory.color}
              />
              <Divider />
              <ProfileRow
                icon="shield-checkmark-outline"
                label="Account Type"
                value={isDriver ? "Driver" : "Commuter"}
              />
            </View>

            {/* ===== SECTION: QUICK ACTIONS ===== */}
            <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
            <View style={styles.card}>
              <ActionRow
                icon="map-outline"
                label="View terminal routes"
                onPress={() => router.push("/mapping")}
              />
              <Divider />
              <ActionRow
                icon="cash-outline"
                label="Check fare prices"
                onPress={() => router.push("/farePrices")}
              />
              <Divider />
              <ActionRow
                icon="navigate-outline"
                label="Plan a trip"
                onPress={() => router.push("/Dashboard")}
              />
            </View>

            {/* ===== SECTION: ABOUT ===== */}
            <Text style={styles.sectionLabel}>ABOUT</Text>
            <View style={styles.card}>
              <ProfileRow
                icon="information-circle-outline"
                label="App Version"
                value="1.0.0"
              />
              <Divider />
              <ProfileRow
                icon="business-outline"
                label="Fare Reference"
                value="LTFRB Approved"
              />
            </View>

            {/* ===== LOGOUT ===== */}
            <TouchableOpacity
              style={styles.logout}
              onPress={handleLogout}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={18} color={C.red} />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>

            <Text style={styles.footer}>FareGo • v1.0.0</Text>

            {/* Spacer so bottom nav doesn't cover content */}
            <View style={{ height: 100 }} />

          </ScrollView>

          {/* ===== BOTTOM NAV ===== */}
          <View style={styles.row}>
            <GridNavButton title="Dashboard"   route="/Dashboard"  icon="view-dashboard-outline" active={pathname === "/Dashboard"} />
            <GridNavButton title="Map routes"  route="/mapping"    icon="map-marker-path"        active={pathname === "/mapping"} />
            <GridNavButton title="Fare prices" route="/farePrices" icon="cash-multiple"          active={pathname === "/farePrices"} />
            <GridNavButton title="Profile"     route="/profile"    icon="account-circle"         active={pathname === "/profile"} />
          </View>

        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

// ============================================================
// Small reusable pieces
// ============================================================
function Stat({
  label, value, color,
}: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProfileRow({
  icon, label, value, valueColor,
}: { icon: any; label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.rowItem}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={16} color={C.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text
          style={[styles.rowValue, valueColor ? { color: valueColor } : null]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function ActionRow({
  icon, label, onPress,
}: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.rowItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={16} color={C.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowValue}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.muted} />
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  // Transparent overlay — main-bg shows through
  overlay: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.38)",
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },

  // ---------- header card ----------
  headerCard: {
    marginBottom: 8,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderTopRightRadius: 14,
    borderTopLeftRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.44)",
    shadowColor: "#f8f8f8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  welcome: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: C.tealDark,
    marginBottom: 2,
  },
  noticeBrand: {
    color: C.sub,
    fontFamily: "monster_act",
    fontSize: 11,
    lineHeight: 15,
  },

  // ---------- hero card ----------
  heroCard: {
    marginBottom: 10,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopLeftRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.44)",
    shadowColor: "#f8f8f8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 5,
  },
  blurFill: { padding: 14 },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "monsterrat_kp",
    letterSpacing: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  name: {
    fontSize: 17,
    fontFamily: "monsterrat_kp",
    color: C.text,
    flexShrink: 1,
  },
  email: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: C.sub,
    marginBottom: 8,
  },
  idPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.9)",
  },
  idText: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 0.8,
  },
  heroDivider: {
    height: 0.6,
    backgroundColor: "rgba(217, 230, 227, 0.9)",
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: {
    fontSize: 14,
    fontFamily: "monsterrat_kp",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    letterSpacing: 1,
    color: C.muted,
  },
  statSep: {
    width: 0.6,
    height: 26,
    backgroundColor: "rgba(217, 230, 227, 0.9)",
  },

  // ---------- sections ----------
  sectionLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    letterSpacing: 1.4,
    color: C.teal,
    marginTop: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.44)",
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#f8f8f8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(49, 144, 134, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(49, 144, 134, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: C.muted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 13,
    fontFamily: "monster_act",
    color: C.text,
  },
  divider: {
    height: 0.6,
    backgroundColor: "rgba(217, 230, 227, 0.9)",
    marginLeft: 60,
  },

  // ---------- logout ----------
  logout: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.35)",
    paddingVertical: 15,
    borderRadius: 14,
    shadowColor: "#f8f8f8",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  logoutText: {
    color: C.red,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.4,
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    fontFamily: "monster_act",
    color: C.muted,
    marginTop: 18,
    letterSpacing: 0.6,
  },

  // ---------- bottom nav (matches FarePrices) ----------
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
});