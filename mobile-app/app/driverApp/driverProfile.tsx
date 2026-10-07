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
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";

// Build a full URL whether the DB stores a relative path or a full URL
function resolveAvatarUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

// ============================================================
// Validation helpers
// ============================================================
const CONTACT_DIGITS = 11;
const GMAIL_DOMAIN = "gmail.com";

/** Common Gmail misspellings so we can say "did you mean...?" */
const GMAIL_TYPOS = [
  "gmial.com", "gmai.com", "gmal.com", "gamil.com", "gnail.com",
  "gmaill.com", "gmail.co", "gmail.con", "gmail.comm", "gmailcom",
  "gmail.cm", "gmail.om", "gmail.com.ph", "gmail.co.uk",
];

/** Strips everything that isn't a digit and hard-stops at 11 digits. */
function sanitizeContactNumber(raw: string): string {
  return (raw || "").replace(/[^0-9]/g, "").slice(0, CONTACT_DIGITS);
}

function validateContactNumber(raw: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null; // optional field

  if (!/^\d+$/.test(value)) return "Contact number must contain digits only.";
  if (value.length !== CONTACT_DIGITS) {
    return `Contact number must be exactly ${CONTACT_DIGITS} digits.`;
  }
  return null;
}

function validateEmail(raw: string): string | null {
  const email = (raw || "").trim();

  if (!email) return "Email is required.";
  if (/\s/.test(email)) return "Email cannot contain spaces.";
  if (email.includes("..")) return "Email cannot contain two dots in a row.";

  const atCount = (email.match(/@/g) || []).length;
  if (atCount === 0) return "Email is incomplete — it must end with @gmail.com.";
  if (atCount > 1) return "Email can only contain one @ symbol.";

  const [localPart, domainPart] = email.split("@");

  if (!localPart) return "Enter your username before @gmail.com.";
  if (!domainPart) return "Email is incomplete — add gmail.com after the @.";

  const local = localPart;
  const domain = domainPart.toLowerCase().replace(/\.+$/, ""); // ignore trailing dot

  if (domain !== GMAIL_DOMAIN) {
    if (
      GMAIL_TYPOS.includes(domain) ||
      domain.includes("gmail") ||
      domain.startsWith("gmai") ||
      domain.startsWith("gmal")
    ) {
      return "Did you mean @gmail.com? Please check the spelling.";
    }
    return "Only @gmail.com email addresses are accepted.";
  }

  // Gmail usernames: letters, digits, dots; must start & end alphanumeric
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?$/.test(local)) {
    return "That Gmail username is not valid.";
  }

  return null;
}

export default function DriverProfile() {
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
  const { user, token, logout, login } = useAuth();

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [tripsThisWeek, setTripsThisWeek]   = useState(0);
  const [tripsThisMonth, setTripsThisMonth] = useState(0);

  const [vehicle, setVehicle] = useState({
    plate: "—",
    model: "—",
  });

  // Avatar — held as a fully-qualified URL (or null to fall back to initials)
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // Inline field errors
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    contactNumber?: string;
  }>({});

  // ---- Edit form state ----
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    contactNumber: "",
    email: "",
    newPassword: "",
    confirmPassword: "",
  });

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
  // Hydrate avatar from the auth user
  // ============================================================
  useEffect(() => {
    const stored =
      (user as any)?.profileImage ||
      (user as any)?.driverProfile ||
      (user as any)?.driver_profile ||
      null;
    setAvatarUri(resolveAvatarUrl(stored));
  }, [user]);

  // ============================================================
  // Prefill edit form when the modal opens
  // ============================================================
  useEffect(() => {
    if (!showEditModal) return;
    setForm({
      firstName:     (user as any)?.firstName     || "",
      middleName:    (user as any)?.middleName    || "",
      lastName:      (user as any)?.lastName      || "",
      contactNumber: sanitizeContactNumber((user as any)?.contactNumber || ""),
      email:         (user as any)?.email         || "",
      newPassword:   "",
      confirmPassword: "",
    });
    setFieldErrors({});
  }, [showEditModal, user]);

  // ============================================================
  // Fetch trip stats
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

  // ============================================================
  // Fetch vehicle info
  // ============================================================
  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/auth/driverQueue?driver_id=${driverId}`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data?.driver) {
          setVehicle({
            plate: json.data.driver.plate_number || "—",
            model: json.data.driver.vehicle_type || "—",
          });
        }
      } catch (e) {
        console.warn("[driverProfile] vehicle fetch failed:", e);
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

  const terminal = {
    name: user?.terminal_name || "Koronadal City Terminal",
    id:   user?.terminal_id   || 1,
  };

  // ============================================================
  // Pick + upload avatar using FileSystem.uploadAsync
  // ============================================================
  const handlePickAvatar = async () => {
    if (uploading) return;

    try {
      // Ask for permission
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow access to your photos to change your profile picture."
        );
        return;
      }

      // Open picker — SDK 51+ uses MediaType array
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as ImagePicker.MediaType[],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      // Optimistic preview
      setAvatarUri(asset.uri);
      setUploading(true);

      const uploadUrl = `${API_URL}/api/auth/driver/${driverId}/avatar`;

      // FileSystem.uploadAsync streams the file from disk — no Blob,
      // no base64 roundtrip, no deprecation warning.
      const response = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "avatar",                      // must match multer's .single("avatar")
        mimeType: asset.mimeType || "image/jpeg",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      // Response body is plain text — parse it manually
      let json: any = null;
      try {
        json = JSON.parse(response.body);
      } catch {
        console.warn(
          "[driverProfile] avatar upload returned non-JSON:",
          response.status,
          response.body?.slice(0, 200)
        );
        throw new Error(
          `Server error (${response.status}) — endpoint may not exist yet.`
        );
      }

      if (response.status < 200 || response.status >= 300 || !json.success) {
        throw new Error(json.message || `Upload failed (${response.status})`);
      }

      // Server returns relative path — resolve to full URL for display
      const serverUrl = json.url ? resolveAvatarUrl(json.url) : asset.uri;
      setAvatarUri(serverUrl);

      // Persist the new avatar into the auth context so it survives restarts
      if (login && user) {
        await login(
          { ...(user as any), profileImage: json.url ?? asset.uri },
          token as string,
          true
        );
      }
    } catch (e: any) {
      console.warn("[driverProfile] avatar upload error:", e);
      Alert.alert("Upload failed", e?.message || "Could not upload image.");
      // Roll back preview to whatever was previously stored
      const stored =
        (user as any)?.profileImage ||
        (user as any)?.driverProfile ||
        null;
      setAvatarUri(resolveAvatarUrl(stored));
    } finally {
      setUploading(false);
    }
  };

  // ============================================================
  // Save profile (self-service fields only)
  // ============================================================
  const handleSaveProfile = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      Alert.alert("Missing fields", "First name and last name are required.");
      return;
    }

    const emailError   = validateEmail(form.email);
    const contactError = validateContactNumber(form.contactNumber);

    if (emailError || contactError) {
      setFieldErrors({
        email: emailError || undefined,
        contactNumber: contactError || undefined,
      });
      Alert.alert(
        "Please check your details",
        emailError || contactError || "Some fields are invalid."
      );
      return;
    }
    setFieldErrors({});

    if (form.newPassword || form.confirmPassword) {
      if (form.newPassword.length < 8) {
        Alert.alert("Password too short", "Password must be at least 8 characters.");
        return;
      }
      if (form.newPassword !== form.confirmPassword) {
        Alert.alert("Passwords don't match", "Please re-enter your new password.");
        return;
      }
    }

    setSaving(true);
    try {
      const body: any = {
        firstName:     form.firstName.trim(),
        middleName:    form.middleName.trim() || null,
        lastName:      form.lastName.trim(),
        contactNumber: form.contactNumber.trim() || null,
        email:         form.email.trim().toLowerCase(),
      };
      if (form.newPassword) body.password = form.newPassword;

      const res = await fetch(
        `${API_URL}/api/auth/driver/${driverId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update profile");
      }

      if (login && json.driver) {
        const updatedUser = {
          ...(user as any),
          firstName:     json.driver.first_name     ?? user?.firstName,
          middleName:    json.driver.middle_name    ?? (user as any)?.middleName,
          lastName:      json.driver.last_name      ?? user?.lastName,
          contactNumber: json.driver.contact_number ?? (user as any)?.contactNumber,
          email:         json.driver.email          ?? user?.email,
        };
        await login(updatedUser, token as string, true);
      }

      setShowEditModal(false);
      Alert.alert("Success", "Your profile has been updated.");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
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
            {/* ===== IDENTITY CARD ===== */}
            <BlurView intensity={45} tint="light" style={styles.identityCard}>
              {/* Tappable avatar */}
              <TouchableOpacity
                style={styles.avatarWrap}
                activeOpacity={0.85}
                onPress={handlePickAvatar}
                disabled={uploading}
              >
                <View style={styles.avatar}>
                  {avatarUri ? (
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Text style={styles.avatarText}>{initials}</Text>
                  )}
                </View>

                {/* Camera badge / spinner overlay */}
                <View style={styles.avatarBadge}>
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons
                      name="camera"
                      size={12}
                      color="#fff"
                    />
                  )}
                </View>
              </TouchableOpacity>

              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>

              <Text style={styles.email} numberOfLines={1}>
                {user?.email || "No email"}
              </Text>

              <View style={styles.rolePill}>
                <MaterialCommunityIcons name="car" size={11} color="#319086" />
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

              <TouchableOpacity
                style={styles.editBtn}
                activeOpacity={0.85}
                onPress={() => setShowEditModal(true)}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={14}
                  color="#319086"
                />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </BlurView>

            {/* ===== PERFORMANCE ===== */}
            <Text style={styles.sectionLabel}>PERFORMANCE</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <View style={styles.statIconWrap}>
                  <MaterialCommunityIcons name="car" size={18} color="#319086" />
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
            </View>

            {/* ===== ACCOUNT INFO ===== */}
            <Text style={styles.sectionLabel}>ACCOUNT INFORMATION</Text>
            <BlurView intensity={40} tint="light" style={styles.card}>
              <InfoRow icon="account-outline" label="Full Name" value={displayName} />
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

            {/* ===== TERMINAL ===== */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>TERMINAL ASSIGNMENT</Text>
              <View style={styles.lockedPill}>
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={10}
                  color="#7f9f97"
                />
                <Text style={styles.lockedPillText}>Admin-managed</Text>
              </View>
            </View>
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
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>VEHICLE</Text>
              <View style={styles.lockedPill}>
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={10}
                  color="#7f9f97"
                />
                <Text style={styles.lockedPillText}>Admin-managed</Text>
              </View>
            </View>
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
                  <Text style={styles.vehiclePlate}>{vehicle.plate}</Text>
                </View>
                <View style={styles.vehicleStatusPill}>
                  <View style={styles.vehicleStatusDot} />
                  <Text style={styles.vehicleStatusText}>Active</Text>
                </View>
              </View>

              <View style={styles.vehicleDivider} />

              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleRowLabel}>Plate Number</Text>
                <Text style={styles.vehicleRowValue}>{vehicle.plate}</Text>
              </View>
              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleRowLabel}>Vehicle Type</Text>
                <Text style={styles.vehicleRowValue}>{vehicle.model}</Text>
              </View>
              <View style={styles.vehicleRow}>
                <Text style={styles.vehicleRowLabel}>Franchise Status</Text>
                <Text style={[styles.vehicleRowValue, { color: "#15803D" }]}>
                  Valid
                </Text>
              </View>
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
          <View style={[styles.row, { bottom: navBottomOffset }]}>
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

        {/* ===== EDIT PROFILE MODAL ===== */}
        <Modal
          visible={showEditModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEditModal(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowEditModal(false)}
          >
            <Pressable
              style={styles.editModalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <ScrollView
                contentContainerStyle={styles.editModalBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.editModalIconWrap}>
                  <MaterialCommunityIcons
                    name="account-edit-outline"
                    size={24}
                    color="#319086"
                  />
                </View>

                <Text style={styles.editModalTitle}>Edit Profile</Text>
                <Text style={styles.editModalSubtitle}>
                  Update your personal information
                </Text>

                <Field
                  label="First Name"
                  icon="account-outline"
                  value={form.firstName}
                  onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                />
                <Field
                  label="Middle Name"
                  icon="account-outline"
                  value={form.middleName}
                  onChangeText={(v) => setForm((f) => ({ ...f, middleName: v }))}
                  optional
                />
                <Field
                  label="Last Name"
                  icon="account-outline"
                  value={form.lastName}
                  onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                />
                <Field
                  label="Contact Number"
                  icon="phone-outline"
                  value={form.contactNumber}
                  onChangeText={(v) => {
                    setForm((f) => ({
                      ...f,
                      contactNumber: sanitizeContactNumber(v),
                    }));
                    if (fieldErrors.contactNumber) {
                      setFieldErrors((e) => ({ ...e, contactNumber: undefined }));
                    }
                  }}
                  onBlur={() =>
                    setFieldErrors((e) => ({
                      ...e,
                      contactNumber:
                        validateContactNumber(form.contactNumber) || undefined,
                    }))
                  }
                  keyboardType="phone-pad"
                  optional
                  helper={
                    form.contactNumber.length
                      ? `${form.contactNumber.length}/${CONTACT_DIGITS} digits`
                      : `${CONTACT_DIGITS} digits, numbers only`
                  }
                  error={fieldErrors.contactNumber}
                />
                <Field
                  label="Email Address"
                  icon="email-outline"
                  value={form.email}
                  onChangeText={(v) => {
                    setForm((f) => ({ ...f, email: v }));
                    if (fieldErrors.email) {
                      setFieldErrors((e) => ({ ...e, email: undefined }));
                    }
                  }}
                  onBlur={() =>
                    setFieldErrors((e) => ({
                      ...e,
                      email: validateEmail(form.email) || undefined,
                    }))
                  }
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="yourname@gmail.com"
                  error={fieldErrors.email}
                />

                <View style={styles.editDivider} />

                <Text style={styles.editSectionLabel}>
                  CHANGE PASSWORD (OPTIONAL)
                </Text>

                <Field
                  label="New Password"
                  icon="lock-outline"
                  value={form.newPassword}
                  onChangeText={(v) => setForm((f) => ({ ...f, newPassword: v }))}
                  secureTextEntry
                  placeholder="Leave empty to keep current"
                />
                <Field
                  label="Confirm Password"
                  icon="lock-outline"
                  value={form.confirmPassword}
                  onChangeText={(v) => setForm((f) => ({ ...f, confirmPassword: v }))}
                  secureTextEntry
                  placeholder="Re-enter new password"
                />
              </ScrollView>

              <View style={styles.editModalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setShowEditModal(false)}
                  activeOpacity={0.85}
                  disabled={saving}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    styles.modalConfirmBtn,
                    saving && { opacity: 0.6 },
                  ]}
                  onPress={handleSaveProfile}
                  activeOpacity={0.85}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ===== LOGOUT MODAL ===== */}
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
// Field + row helpers
// ============================================================
function Field({
  label,
  icon,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  placeholder,
  optional,
  maxLength,
  onBlur,
  error,
  helper,
}: {
  label: string;
  icon: any;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  placeholder?: string;
  optional?: boolean;
  maxLength?: number;
  onBlur?: () => void;
  error?: string;
  helper?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.fieldOptional}>  · optional</Text> : null}
      </Text>
      <View style={[styles.fieldInputWrap, error ? styles.fieldInputWrapError : null]}>
        <MaterialCommunityIcons
          name={icon}
          size={16}
          color={error ? "#e74c3c" : "#7f9f97"}
          style={styles.fieldIcon}
        />
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor="#b5c4c0"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? "words"}
          autoCorrect={false}
          maxLength={maxLength}
        />
      </View>

      {error ? (
        <View style={styles.fieldErrorRow}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={12}
            color="#e74c3c"
          />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.fieldHelperText}>{helper}</Text>
      ) : null}
    </View>
  );
}

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
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
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
  idRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 14 },
  idText: {
    fontSize: 11,
    fontFamily: "digitalFont",
    color: "#7f9f97",
    letterSpacing: 1,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(49,144,134,0.12)",
    borderWidth: 1,
    borderColor: "rgba(49,144,134,0.28)",
  },
  editBtnText: {
    fontSize: 12,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#319086",
    letterSpacing: 0.3,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 6,
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
  lockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(127,159,151,0.10)",
  },
  lockedPillText: {
    fontSize: 9,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 0.4,
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
    paddingHorizontal: 24,
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

  editModalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    overflow: "hidden",
  },
  editModalBody: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 8,
  },
  editModalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(49,144,134,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(49,144,134,0.28)",
    marginBottom: 12,
  },
  editModalTitle: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: "#1f6f66",
    textAlign: "center",
    marginBottom: 4,
  },
  editModalSubtitle: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: "#7f9f97",
    textAlign: "center",
    marginBottom: 20,
  },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 2,
  },
  fieldOptional: {
    fontFamily: "monster_act",
    fontWeight: "400",
    color: "#b5c4c0",
  },
  fieldInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(49,144,134,0.22)",
    paddingHorizontal: 12,
  },
  fieldInputWrapError: {
    borderColor: "rgba(231, 76, 60, 0.65)",
    backgroundColor: "rgba(255, 244, 242, 0.95)",
  },
  fieldIcon: { marginRight: 8 },
  fieldInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: "monster_act",
    fontSize: 13,
    color: "#1f3d38",
  },
  fieldErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 5,
    marginLeft: 2,
  },
  fieldErrorText: {
    flex: 1,
    fontSize: 10.5,
    fontFamily: "monster_act",
    color: "#e74c3c",
  },
  fieldHelperText: {
    fontSize: 10.5,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginTop: 5,
    marginLeft: 2,
  },

  editDivider: {
    height: 0.6,
    backgroundColor: "rgba(233,240,238,0.9)",
    marginVertical: 14,
  },
  editSectionLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 1.2,
    marginBottom: 12,
    marginLeft: 2,
  },
  editModalActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderTopWidth: 0.6,
    borderTopColor: "rgba(233,240,238,0.9)",
    backgroundColor: "rgba(255,255,255,0.5)",
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
  modalConfirmBtn: { backgroundColor: "#319086" },
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