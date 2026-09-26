import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  ImageBackground, StatusBar, ActivityIndicator,
} from "react-native";
import GridNavButton from "./components/GridNavButton";
import { useFonts } from "expo-font";
import { BlurView } from 'expo-blur';
import { usePathname } from "expo-router";
import { useState, useEffect, useMemo } from "react";
import { API_URL } from "./_layout";

type Fare = {
  from_terminal: string;
  to_terminal: string;
  kilometer: string | number;
  regular_t: string | number;
  discounted_t: string | number;
  regular_m: string | number;
  discounted_m: string | number;
};

export default function FarePrices() {
  const pathname = usePathname();

  const [fares, setFares]     = useState<Fare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_URL}/api/auth/Fare`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setFares(Array.isArray(data) ? data : []);
      } catch (e: any) {
        console.error('[FarePrices] fetch failed:', e);
        if (!cancelled) setError(e.message || 'Failed to load fares');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const map: Record<string, Fare[]> = {};
    fares.forEach(f => {
      const key = f.from_terminal || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(f);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [fares]);

  if (!fontsLoaded) return null;

  const peso = (v: any) =>
    v == null || v === '' ? '—' : `₱${Number(v).toFixed(2)}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ImageBackground
        source={require('../assets/images/main-bg.png')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.38)' }}>

          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.header}>
              <Text style={styles.welcome}>Fare prices</Text>
             <Text style={styles.noticeBrand}> LTFRB. This app only
                displays the approved fare matrix and does not modify or set
                any fare amount.
              </Text>
            </View>

            <BlurView intensity={40} tint="light" style={styles.FareContainer}>

              {loading && (
                <View style={styles.stateBox}>
                  <ActivityIndicator size="large" color="#319086" />
                  <Text style={styles.stateText}>Loading fares…</Text>
                </View>
              )}

              {!loading && error && (
                <View style={styles.stateBox}>
                  <Text style={styles.errorText}>⚠ {error}</Text>
                  <Text style={styles.stateText}>Check that the backend is running.</Text>
                </View>
              )}

              {!loading && !error && groups.length === 0 && (
                <View style={styles.stateBox}>
                  <Text style={styles.stateText}>No fare data yet.</Text>
                </View>
              )}

              {!loading && !error && groups.length > 0 && (
                <ScrollView
                  horizontal={true}
                  showsHorizontalScrollIndicator={false}
                >
                  {/* Fixed-width wrapper = sum of column widths + gaps */}
                  <View style={styles.tableWrapper}>

                    <Text style={styles.TextHeader}>Public Terminal Fare Prices</Text>

                    {/* "Current fare" row — flex thirds within table width */}
                    <View style={styles.headerRow}>
                      <Text style={styles.currentHeader}>Current fare:</Text>
                      <Text style={styles.tradHeader}>Traditional UVE ₱ 2.40/KM</Text>
                      <Text style={styles.ModHeader}>Modernize UVE ₱ 2.50/KM</Text>
                    </View>

                    {/* Column headers — pixel widths matching data cells */}
                    <View style={styles.secHeaderRow}>
                      <Text style={styles.routeHeader}>ROUTE FROM</Text>
                      <Text style={styles.viseHeader}>TO: VICE VERSA</Text>
                      <Text style={styles.kmHeader}>NO. OF KM</Text>
                      <Text style={styles.fareTradHeader}>REGULAR FARE{'\n'}(UV-EXPRESS AIRCON)</Text>
                      <Text style={styles.discTradHeader}>STUDENT/SC/PWD's</Text>
                      <Text style={styles.fareModHeader}>REGULAR FARE{'\n'}(UV-EXPRESS AIRCON)</Text>
                      <Text style={styles.discModdHeader}>STUDENT/SC/PWD's</Text>
                    </View>

                    {groups.map(([fromTerminal, rows]) => (
                      <View key={fromTerminal}>
                        <View style={styles.groupDivider}>
                          <Text style={styles.groupTitle}>
                            {fromTerminal.toUpperCase()}
                          </Text>
                        </View>

                        {rows.map((fare, idx) => (
                          <View
                            key={idx}
                            style={[
                              styles.dataRow,
                              idx % 2 === 0 && styles.dataRowAlt,
                            ]}
                          >
                            <Text style={styles.dataCell} numberOfLines={1}></Text>
                            <Text style={styles.dataCell} numberOfLines={1}>
                              {fare.to_terminal || '—'}
                            </Text>
                            <Text style={styles.dataCell} numberOfLines={1}>
                              {fare.kilometer ?? '—'}
                            </Text>
                            <Text style={styles.dataCellFare}>{peso(fare.regular_t)}</Text>
                            <Text style={styles.dataCellFare}>{peso(fare.discounted_t)}</Text>
                            <Text style={styles.dataCellFare}>{peso(fare.regular_m)}</Text>
                            <Text style={styles.dataCellFare}>{peso(fare.discounted_m)}</Text>
                          </View>
                        ))}
                      </View>
                    ))}

                    <View style={{ height: 20 }} />
                  </View>
                </ScrollView>
              )}

            </BlurView>
          </ScrollView>

          <View style={styles.row}>
            <GridNavButton title="Dashboard"   route="/Dashboard"  icon="view-dashboard-outline" active={pathname === "/Dashboard"} />
            <GridNavButton title="Map routes"  route="/mapping"    icon="map-marker-path"        active={pathname === "/mapping"} />
            <GridNavButton title="Fare prices" route="/farePrices" icon="cash-multiple"          active={pathname === "/farePrices"} />
            <GridNavButton title="Vehicles"    route="/vehicle"    icon="car"                    active={pathname === "/vehicle"} />
            <GridNavButton title="Profile"     route="/profile"    icon="account-circle"         active={pathname === "/profile"} />
          </View>

        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

/* ---------- Layout constants ---------- */
const COL_ROUTE   = 90;
const COL_TO      = 90;
const COL_KM      = 60;
const COL_FARE    = 100;   // every fare column
const GAP         = 5;     // gap between columns
const NUM_GAPS    = 6;     // 7 columns = 6 gaps
const TABLE_WIDTH = (COL_ROUTE + COL_TO + COL_KM + COL_FARE * 4) + GAP * NUM_GAPS;
// 90+90+60+400+30 = 670

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  container: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  header: {
    padding: 15,
  },
  welcome: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: '#1f6f66',
  },

  noticeBrand: {
    fontWeight: '700',
    color: '#a67614',
  },

  FareContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 0.3,
    borderColor: 'rgb(240, 233, 233)',
    margin: 5,
    padding: 5,
    minHeight: 300,
    maxHeight: 650,
    shadowColor: '#f9f9f956',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },

  stateBox: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    marginTop: 10,
    color: '#666',
    fontSize: 12,
    fontFamily: "monster_act",
  },
  errorText: {
    color: '#c33',
    fontSize: 13,
    fontFamily: "monster_act",
  },

  /* Fixed-width table wrapper — sizes exactly to content */
  tableWrapper: {
    width: TABLE_WIDTH,
  },

  TextHeader: {
    color: '#319086',
    fontSize: 14,
    padding: 8,
    fontFamily: "monsterrat_kp",
  },

  /* "Current fare" row — thirds spanning the full table width */
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.3,
    borderBottomColor: "#000",
    width: TABLE_WIDTH,
  },
  currentHeader: {
    flex: 1,
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'center',
    borderRightWidth: 0.3,
    paddingVertical: 4,
  },
  tradHeader: {
    flex: 1,
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'center',
    borderRightWidth: 0.3,
    paddingVertical: 4,
  },
  ModHeader: {
    flex: 1,
    fontSize: 10,
    color: 'black',
    fontFamily: "monster_act",
    textAlign: 'center',
    paddingVertical: 4,
  },

  /* Column header row */
  secHeaderRow: {
    flexDirection: 'row',
    gap: GAP,
    borderBottomWidth: 0.3,
    borderBottomColor: "#000",
    paddingTop: 4,
    paddingBottom: 4,
  },

  routeHeader:    { fontSize: 10, color: 'black', fontFamily: "monster_act", textAlign: 'center', width: COL_ROUTE, borderRightWidth: 0.3, paddingHorizontal: 4 },
  viseHeader:     { fontSize: 10, color: 'black', fontFamily: "monster_act", textAlign: 'center', width: COL_TO,    borderRightWidth: 0.3, paddingHorizontal: 4 },
  kmHeader:       { fontSize: 10, color: 'black', fontFamily: "monster_act", textAlign: 'center', width: COL_KM,    borderRightWidth: 0.3, paddingHorizontal: 4 },
  fareTradHeader: { fontSize: 10, color: 'black', fontFamily: "monster_act", textAlign: 'center', width: COL_FARE,  borderRightWidth: 0.3, paddingHorizontal: 4 },
  discTradHeader: { fontSize: 10, color: 'black', fontFamily: "monster_act", textAlign: 'center', width: COL_FARE,  borderRightWidth: 0.3, paddingHorizontal: 4 },
  fareModHeader:  { fontSize: 10, color: 'black', fontFamily: "monster_act", textAlign: 'center', width: COL_FARE,  borderRightWidth: 0.3, paddingHorizontal: 4 },
  discModdHeader: { fontSize: 10, color: 'black', fontFamily: "monster_act", textAlign: 'center', width: COL_FARE,  paddingHorizontal: 4 },

  /* Group divider */
  groupDivider: {
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#319086',
  },
  groupTitle: {
    fontSize: 13,
    color: '#319086',
    fontFamily: "monsterrat_kp",
    letterSpacing: 0.8,
  },

  /* Data rows — same column widths as the header */
  dataRow: {
    flexDirection: 'row',
    gap: GAP,
    paddingVertical: 8,
    borderBottomWidth: 0.3,
    borderBottomColor: '#d9e6e3',
  },
  dataRowAlt: {
    backgroundColor: 'rgba(237, 246, 243, 0.5)',
  },
  dataCell: {
    fontSize: 11,
    color: '#1f3d38',
    fontFamily: "monster_act",
    textAlign: 'left',
     width: 94,
    paddingHorizontal: 4,
  },
  dataCellFare: {
    fontSize: 11,
    color: '#23786f',
    fontFamily: "monster_act",
    textAlign: 'left',
    width: 98,
    paddingHorizontal: 4,
    fontWeight: '600',
  },

  row: {
    position: "absolute",
    bottom: 25,
    width: "98%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderRadius: 24,
    height: 46,
    backgroundColor: "rgba(233, 233, 233, 0.64)",
    borderWidth: 0.8,
    borderColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
});