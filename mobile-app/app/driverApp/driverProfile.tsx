import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
  Modal,
  Pressable,
  StatusBar,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";

export default function DriverProfile() {
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
  const { user, token, logout } = useAuth();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [tripsThisWeek, setTripsThisWeek] = useState(0);
  const [tripsThisMonth, setTripsThisMonth] = useState(0);

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

  const driverId =
    (user as any)?.driverId ||
    (user as any)?.driver_id ||
    (user as any)?.id;

  // ============================================================
  // Fetch weekly + monthly trip counts
  // ============================================================
  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;

    (async () => {
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
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setTripsThisWeek(json.data.tripsThisWeek || 0);
          setTripsThisMonth(json.data.tripsThisMonth || 0);
        }
      } catch (e) {
        console.warn("[driverProfile] stats fetch failed:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [driverId, token]);

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Driver Partner"
    : "Driver Partner";

  const initials = user
    ? `${(user.firstName || "?").charAt(0)}${(user.lastName || "?").charAt(0)}`.toUpperCase()
    : "?";

  const driverId_label = user?.id ? `DRV-${String(user.id).padStart(5, "0")}` : "DRV-00000";

  const vehicle = {
    plate: "ABC 1234",
    model: "Toyota Hiace UV Express",
    capacity: 14,
    status: "Active",
  };

  const terminal = {
    name: user?.terminal_name || "Koronadal City Terminal",
    id: user?.terminal_id || 1,
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutModal(false);
    try {
      await logout();
    } catch (e) {
      console.warn("[driverProfile] logout error:", e);
    }
    router.replace("/");
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
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
            {/* ===== HEADER / IDENTITY ===== */}
            <BlurView intensity={45} tint="light" style={styles.identityCard}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.avatarBadge}>
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={14}
                    color="#fff"
                  />
                </View>
              </View>

              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>

              <Text style={styles.email} numberOfLines={1}>
                {user?.email || "No email"}
              </Text>

              <View style={styles.rolePill}>
                <MaterialCommunityIcons
                  name="car"
                  size={11}
                  color="#319086"
                />
                <Text style={styles.roleText}>DRIVER PARTNER</Text>
              </View>

              <View style={styles.idRow}>
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={12}
                  color="#7f9f97"
                />
                <Text style={styles.idText}>{driverId_label}</Text>
              </View>
            </BlurView>

            {/* ===== PERFORMANCE SUMMARY ===== */}
            <Text style={styles.sectionLabel}>PERFORMANCE</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <View style={styles.statIconWrap}>
                  <MaterialCommunityIcons
                    name="car"
                    size={18}
                    color="#319086"
                  />
                </View>
                <Text style={styles.statValue}>{tripsThisWeek}</Text>
                <Text style={styles.statLabel}>TRIPS THIS WEEK</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statCard}>
                <View
                  style={[
                    styles.statIconWrap,
                    { backgroundColor: "rgba(37,99,235,0.12)" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="calendar-month"
                    size={18}
                    color="#2563EB"
                  />
                </View>
                <Text style={styles.statValue}>{tripsThisMonth}</Text>
                <Text style={styles.statLabel}>TRIPS THIS MONTH</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statCard}>
                <View
                  style={[
                    styles.statIconWrap,
                    { backgroundColor: "rgba(217,119,6,0.12)" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="star"
                    size={18}
                    color="#D97706"
                  />
                </View>
                <Text style={styles.statValue}>4.8</Text>
                <Text style={styles.statLabel}>RATING</Text>
              </View>
            </View>

            {/* ===== ACCOUNT INFO ===== */}
            <Text style={styles.sectionLabel}>ACCOUNT INFORMATION</Text>
            <BlurView intensity={40} tint="light" style={styles.card}>
              <InfoRow
                icon="account-outline"
                label="Full Name"
                value={displayName}
              />
              <Divider />
              <InfoRow
                icon="email-outline"
                label="Email Address"
                value={user?.email || "—"}
              />
              <Divider />
              <InfoRow
                icon="shield-account-outline"
                label="Account Type"
                value="Driver Partner"
              />
              <Divider />
              <InfoRow
                icon="card-account-details-outline"
                label="Driver ID"
                value={driverId_label}
              />
            </BlurView>

            {/* ===== TERMINAL ASSIGNMENT ===== */}
            <Text style={styles.sectionLabel}>TERMINAL ASSIGNMENT</Text>
            <BlurView intensity={40} tint="light" style={styles.card}>
              <View style={styles.terminalRow}>
                <View style={styles.terminalIconWrap}>
                  <MaterialCommunityIcons
                    name="map-marker-radius"
                    size={22}
                    color="#319086"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.terminalLabel}>HOME TERMINAL</Text>
                  <Text style={styles.terminalName} numberOfLines={1}>
                    {terminal.name}
                  </Text>
                  <Text style={styles.terminalSub}>
                    All routes originate from here
                  </Text>
                </View>
              </View>
            </BlurView>

            {/* ===== VEHICLE ===== */}
            <Text style={styles.sectionLabel}>VEHICLE</Text>
            <BlurView intensity={40} tint="light" style={styles.card}>
              <View style={styles.vehicleTop}>
                <View style={styles.vehicleIconWrap}>
                  <MaterialCommunityIcons
                    name="van-passenger"
                    size={24}
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
              </View>

              <View style={styles.vehicleDivider} />

              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleRowLabel}>Plate Number</Text>
                <Text style={styles.vehicleRowValue}>{vehicle.plate}</Text>
              </View>
              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleRowLabel}>Capacity</Text>
                <Text style={styles.vehicleRowValue}>
                  {vehicle.capacity} passengers
                </Text>
              </View>
              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleRowLabel}>Franchise Status</Text>
                <Text style={[styles.vehicleRowValue, { color: "#15803D" }]}>
                  Valid
                </Text>
              </View>
            </BlurView>

            {/* ===== SETTINGS ===== */}
            <Text style={styles.sectionLabel}>SETTINGS</Text>
            <BlurView intensity={40} tint="light" style={styles.card}>
              <ActionRow
                icon="lock-outline"
                label="Change Password"
                onPress={() => {}}
              />
              <Divider />
              <ActionRow
                icon="bell-outline"
                label="Notification Preferences"
                onPress={() => {}}
              />
              <Divider />
              <ActionRow
                icon="help-circle-outline"
                label="Help & Support"
                onPress={() => {}}
              />
              <Divider />
              <ActionRow
                icon="information-outline"
                label="App Version"
                value="1.0.0"
              />
            </BlurView>

            {/* ===== LOGOUT ===== */}
            <TouchableOpacity
              style={styles.logoutBtn}
              activeOpacity={0.85}
              onPress={() => setShowLogoutModal(true)}
            >
              <MaterialCommunityIcons name="logout" size={18} color="#e74c3c" />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>

            <Text style={styles.footer}>FareGo • Driver Partner</Text>

            <View style={{ height: navTotalSpace }} />
          </ScrollView>

          {/* ===== BOTTOM NAV ===== */}
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
              title="Fares"
              route="./driverFareprices"
              icon="cash-multiple"
              active={pathname === "/driverApp/driverFareprices"}
            />
            <GridNavButton
              title="Vehicles"
              route="./driverQueue"
              icon="van-passenger"
              active={pathname === "/driverApp/driverQueue"}
            />
            <GridNavButton
              title="Profile"
              route="./driverProfile"
              icon="account-circle"
              active={pathname === "/driverApp/driverProfile"}
            />
          </View>
        </View>

        {/* ===== LOGOUT CONFIRMATION MODAL ===== */}
        <Modal
          visible={showLogoutModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLogoutModal(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowLogoutModal(false)}
          >
            <Pressable
              style={styles.modalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalIconWrap}>
                <MaterialCommunityIcons name="logout" size={26} color="#e74c3c" />
              </View>

              <Text style={styles.modalTitle}>Log out?</Text>
              <Text style={styles.modalMessage}>
                You will be removed from the queue and can log back in anytime.
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setShowLogoutModal(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalConfirmBtn]}
                  onPress={handleLogoutConfirm}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalConfirmText}>Log out</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ImageBackground>
    </SafeAreaView>
  );
}

// ============================================================
// Reusable rows
// ============================================================
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <MaterialCommunityIcons name={icon} size={16} color="#319086" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.infoRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={styles.infoIconWrap}>
        <MaterialCommunityIcons name={icon} size={16} color="#319086" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoValue}>{label}</Text>
      </View>
      {value ? (
        <Text style={styles.actionValue}>{value}</Text>
      ) : (
        <MaterialCommunityIcons
          name="chevron-right"
          size={18}
          color="#7f9f97"
        />
      )}
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.38)",
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  identityCard: {
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.7)",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
  },
  avatarWrap: { marginBottom: 12 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#319086",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.7)",
  },
  avatarText: {
    color: "#fff",
    fontSize: 26,
    fontFamily: "monsterrat_kp",
    letterSpacing: 1,
  },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2ECC8F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  name: {
    fontSize: 20,
    fontFamily: "monsterrat_kp",
    color: "#1f6f66",
    marginBottom: 2,
  },
  email: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginBottom: 10,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(49,144,134,0.12)",
    borderWidth: 1,
    borderColor: "rgba(49,144,134,0.28)",
    marginBottom: 10,
  },
  roleText: {
    fontSize: 9,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#319086",
    letterSpacing: 1,
  },
  idRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  idText: {
    fontSize: 11,
    fontFamily: "digitalFont",
    color: "#7f9f97",
    letterSpacing: 1,
  },

  sectionLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#7f9f97",
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 6,
  },

  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 18,
    paddingVertical: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.6)",
    alignItems: "center",
  },
  statCard: { flex: 1, alignItems: "center", gap: 3 },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49,144,134,0.12)",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "digitalFont",
    color: "#1f3d38",
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 1,
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(233,240,238,0.9)",
    height: 44,
  },

  card: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.6)",
    overflow: "hidden",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49,144,134,0.10)",
  },
  infoLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontFamily: "monster_act",
    color: "#1f3d38",
  },
  actionValue: {
    fontSize: 12,
    fontFamily: "digitalFont",
    color: "#7f9f97",
  },
  divider: {
    height: 0.6,
    backgroundColor: "rgba(233,240,238,0.9)",
    marginLeft: 58,
  },

  terminalRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  terminalIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49,144,134,0.12)",
  },
  terminalLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 1,
  },
  terminalName: {
    fontSize: 14,
    fontFamily: "monsterrat_kp",
    color: "#1f3d38",
    marginTop: 2,
  },
  terminalSub: {
    fontSize: 11,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginTop: 2,
  },

  vehicleTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 12,
  },
  vehicleIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49,144,134,0.12)",
  },
  vehicleModel: {
    fontSize: 14,
    fontFamily: "monsterrat_kp",
    color: "#1f3d38",
  },
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
  vehicleDivider: {
    height: 0.6,
    backgroundColor: "rgba(233,240,238,0.9)",
    marginHorizontal: 16,
  },
  vehicleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  vehicleRowLabel: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#7f9f97",
  },
  vehicleRowValue: {
    fontSize: 12,
    fontFamily: "monsterrat_font",
    fontWeight: "600",
    color: "#1f3d38",
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(231,76,60,0.35)",
    marginTop: 4,
  },
  logoutText: {
    color: "#e74c3c",
    fontSize: 14,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginTop: 16,
    letterSpacing: 0.6,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 30, 28, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  modalIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(231,76,60,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(231,76,60,0.28)",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: "#b03427",
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "monster_act",
    color: "#4a5f5a",
    textAlign: "center",
    marginBottom: 20,
  },
  modalActions: { flexDirection: "row", gap: 10, width: "100%" },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCancelBtn: {
    backgroundColor: "rgba(127,159,151,0.12)",
    borderWidth: 1,
    borderColor: "rgba(127,159,151,0.3)",
  },
  modalConfirmBtn: { backgroundColor: "#e74c3c" },
  modalCancelText: {
    color: "#4a5f5a",
    fontSize: 13,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
  },
  modalConfirmText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
  },

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