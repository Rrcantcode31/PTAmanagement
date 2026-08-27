import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
  ImageBackground,
} from "react-native";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";

export default function DriverDashboard() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../../assets/Font/monster_act.ttf"),
    digitalFont: require("../../assets/Font/digitalFont.ttf"),
  });

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
    : "Driver Partner";

  const dummyStats = { earnings: "1,250", trips: 8, rating: 4.8 };
  const dummyTrips = [
    { id: "1", from: "Main St", to: "Oak Ave", time: "10:30 AM", fare: 120, status: "Completed" },
    { id: "2", from: "Pine Rd", to: "Elm Blvd", time: "09:15 AM", fare: 85, status: "Completed" },
    { id: "3", from: "Maple Dr", to: "Cedar Ln", time: "08:00 AM", fare: 95, status: "Cancelled" },
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ImageBackground
        source={require("../../assets/images/main-bg.png")}
        style={styles.bgImage}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          >
            {/* ===== TOP PROFILE HEADER ===== */}
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.greeting}>{getGreeting()}</Text>
                <Text style={styles.name}>{displayName}</Text>
              </View>
              <TouchableOpacity
                style={styles.avatarButton}
                onPress={() => router.push("./driverProfile")}
              >
                <MaterialCommunityIcons name="account" size={26} color="#1E293B" />
              </TouchableOpacity>
            </View>

            {/* ===== STATUS CARD ===== */}
            <View style={styles.glassCard}>
              <View style={styles.statusHeader}>
                <View>
                  <Text style={styles.cardLabel}>CURRENT STATUS</Text>
                  <Text style={styles.statusSubtext}>
                    {isOnline ? "You are active for trip requests" : "You are currently offline"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: isOnline ? "#DCFCE7" : "#FEE2E2" },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: isOnline ? "#16A34A" : "#DC2626" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isOnline ? "#15803D" : "#B91C1C" },
                    ]}
                  >
                    {isOnline ? "ONLINE" : "OFFLINE"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.toggleBtn,
                  { backgroundColor: isOnline ? "#0F172A" : "#16A34A" },
                ]}
                onPress={() => setIsOnline(!isOnline)}
              >
                <MaterialCommunityIcons
                  name={isOnline ? "power" : "lightning-bolt"}
                  size={20}
                  color="#FFF"
                />
                <Text style={styles.toggleBtnText}>
                  {isOnline ? "Go Offline" : "Go Online Now"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ===== METRICS ROW ===== */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <MaterialCommunityIcons name="cash" size={20} color="#16A34A" />
                <Text style={styles.statValue}>₱{dummyStats.earnings}</Text>
                <Text style={styles.statLabel}>Earnings</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statCard}>
                <MaterialCommunityIcons name="steering" size={20} color="#2563EB" />
                <Text style={styles.statValue}>{dummyStats.trips}</Text>
                <Text style={styles.statLabel}>Trips</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statCard}>
                <MaterialCommunityIcons name="star" size={20} color="#EAB308" />
                <Text style={styles.statValue}>{dummyStats.rating.toFixed(1)}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>

            {/* ===== QUICK ACTIONS ===== */}
            <Text style={styles.sectionHeading}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => router.push("./driverRoute")}
              >
                <View style={[styles.actionIconBg, { backgroundColor: "#E0F2FE" }]}>
                  <MaterialCommunityIcons name="map-marker-path" size={22} color="#0284C7" />
                </View>
                <Text style={styles.actionTileTitle}>View Rides</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => router.push("./driverQueue")}
              >
                <View style={[styles.actionIconBg, { backgroundColor: "#FFE4E6" }]}>
                  <MaterialCommunityIcons name="van-passenger" size={22} color="#E11D48" />
                </View>
                <Text style={styles.actionTileTitle}>My Vehicle</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => router.push("./driverProfile")}
              >
                <View style={[styles.actionIconBg, { backgroundColor: "#FEF3C7" }]}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#D97706" />
                </View>
                <Text style={styles.actionTileTitle}>Report Issue</Text>
              </TouchableOpacity>
            </View>

            {/* ===== RECENT TRIPS ===== */}
            <View style={styles.tripsHeaderRow}>
              <Text style={styles.sectionHeading}>Recent Trips</Text>
              <TouchableOpacity>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.glassCardNoPadding}>
              {dummyTrips.map((trip, idx) => (
                <View
                  key={trip.id}
                  style={[
                    styles.tripRow,
                    idx !== dummyTrips.length - 1 && styles.tripRowBorder,
                  ]}
                >
                  <View style={styles.tripIconWrapper}>
                    <MaterialCommunityIcons
                      name={trip.status === "Completed" ? "check-circle" : "close-circle"}
                      size={20}
                      color={trip.status === "Completed" ? "#16A34A" : "#DC2626"}
                    />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripRoute}>
                      {trip.from} <MaterialCommunityIcons name="arrow-right" size={12} color="#64748B" /> {trip.to}
                    </Text>
                    <Text style={styles.tripTime}>{trip.time}</Text>
                  </View>
                  <View style={styles.tripAmountCol}>
                    <Text style={styles.tripFare}>₱{trip.fare}</Text>
                    <Text
                      style={[
                        styles.tripBadge,
                        { color: trip.status === "Completed" ? "#16A34A" : "#DC2626" },
                      ]}
                    >
                      {trip.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ height: 30 }} />
          </ScrollView>

          {/* ===== BOTTOM NAVIGATION ===== */}
          <View style={styles.bottomBar}>
            <GridNavButton
              title="Dashboard"
              route="./driverDashboard"
              icon="view-dashboard-outline"
              active={pathname === "/driverApp/driverDashboard"}
            />
            <GridNavButton title="Map routes" route="./driverRoute" icon="map-marker-path" />
            <GridNavButton title="Fare prices" route="./driverFareprices" icon="cash-multiple" />
            <GridNavButton title="Vehicles" route="./driverQueue" icon="van-passenger" />
            <GridNavButton title="Profile" route="./driverProfile" icon="account-circle" />
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    backgroundColor: "#0F172A",
  },
  bgImage: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(241, 245, 249, 0.82)", // Modern slate tinted overlay
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 13,
    fontFamily: "monsterrat_kp",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  name: {
    fontSize: 22,
    fontFamily: "monster_act",
    color: "#0F172A",
    marginTop: 2,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  glassCard: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  glassCardNoPadding: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
    overflow: "hidden",
  },
  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: "monsterrat_kp",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  statusSubtext: {
    fontSize: 13,
    fontFamily: "monsterrat_font",
    color: "#334155",
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: "monsterrat_kp",
    fontWeight: "700",
  },
  toggleBtn: {
    flexDirection: "row",
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "monster_act",
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 20,
    paddingVertical: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#E2E8F0",
    height: "70%",
    alignSelf: "center",
  },
  statValue: {
    fontSize: 18,
    fontFamily: "digitalFont",
    color: "#0F172A",
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "monsterrat_font",
    color: "#64748B",
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 15,
    fontFamily: "monster_act",
    color: "#0F172A",
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  actionTile: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
  },
  actionIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  actionTileTitle: {
    fontSize: 11,
    fontFamily: "monsterrat_kp",
    color: "#1E293B",
    textAlign: "center",
  },
  tripsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  seeAllText: {
    fontSize: 12,
    fontFamily: "monsterrat_kp",
    color: "#2563EB",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  tripRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tripIconWrapper: {
    marginRight: 12,
  },
  tripInfo: {
    flex: 1,
  },
  tripRoute: {
    fontSize: 13,
    fontFamily: "monsterrat_kp",
    color: "#0F172A",
  },
  tripTime: {
    fontSize: 11,
    fontFamily: "monsterrat_font",
    color: "#94A3B8",
    marginTop: 2,
  },
  tripAmountCol: {
    alignItems: "flex-end",
  },
  tripFare: {
    fontSize: 15,
    fontFamily: "digitalFont",
    color: "#0F172A",
  },
  tripBadge: {
    fontSize: 10,
    fontFamily: "monsterrat_kp",
    marginTop: 2,
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
});