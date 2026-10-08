import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ImageBackground, Alert, Modal, Pressable, TextInput,
  ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import GridNavButton from "../components/GridNavButton";
import { useAuth } from "../../appContext/authContext";
import { API_URL } from "../_layout";

// ---------- Light palette ----------
const C = {
  teal: "#319086",
  tealDark: "#1f6f66",
  tealDeep: "#23786f",
  text: "#1f3d38",
  sub: "#2d2d2b81",
  muted: "#7f9f97",
  cardBg: "rgba(255, 255, 255, 0.72)",
  cardBorder: "rgba(233, 240, 238, 0.44)",
  divider: "rgba(217, 230, 227, 0.9)",
  green: "#2c7a6e",
  blue: "#1e88e5",
  purple: "#8e44ad",
  orange: "#e67e22",
  red: "#e74c3c",
};

function getFareCategory(role: string | undefined) {
  if (!role) return { label: "Regular", short: "Regular", color: C.green };

  const r = role.toLowerCase();
  if (r.includes("student")) return { label: "Student", short: "Student", color: C.blue };
  if (r.includes("senior"))  return { label: "Senior Citizen", short: "Senior", color: C.purple };
  if (r.includes("pwd"))     return { label: "PWD", short: "PWD", color: C.orange };
  return { label: "Regular", short: "Regular", color: C.green };
}

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

export default function Profile() {
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
  const { user, token, logout, login } = useAuth();

  const [showEditModal, setShowEditModal]     = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    contactNumber?: string;
  }>({});

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

  const userId = (user as any)?.id;

  // ============================================================
  // Hydrate avatar from user object
  // ============================================================
  useEffect(() => {
    const stored =
      (user as any)?.profileImage ||
      (user as any)?.user_profile ||
      (user as any)?.userProfile ||
      null;
    setAvatarUri(resolveAvatarUrl(stored));
  }, [user]);

  // ============================================================
  // Prefill edit form when modal opens
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

  if (!fontsLoaded) return null;

  const displayName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Commuter"
    : "Commuter";

  const initials = user
    ? `${(user.firstName || "?").charAt(0)}${(user.lastName || "?").charAt(0)}`.toUpperCase()
    : "?";

  const fareCategory = getFareCategory(user?.role);
  const isDriver = user?.type === "driver";

  const rawId = (user as any)?.accountId ?? (user as any)?.id ?? "";
  const accountId = rawId ? String(rawId).slice(-6).toUpperCase() : "000000";

  // ============================================================
  // Pick + upload avatar
  // ============================================================
  const handlePickAvatar = async () => {
    if (uploading || !userId) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow access to your photos to change your profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as ImagePicker.MediaType[],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      setAvatarUri(asset.uri);
      setUploading(true);

      const uploadUrl = `${API_URL}/api/auth/user/${userId}/avatar`;

      const response = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "avatar",
        mimeType: asset.mimeType || "image/jpeg",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      let json: any = null;
      try {
        json = JSON.parse(response.body);
      } catch {
        console.warn(
          "[profile] avatar upload returned non-JSON:",
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

      const serverUrl = json.url ? resolveAvatarUrl(json.url) : asset.uri;
      setAvatarUri(serverUrl);

      if (login && user) {
        await login(
          { ...(user as any), profileImage: json.url ?? asset.uri },
          token as string,
          true
        );
      }
    } catch (e: any) {
      console.warn("[profile] avatar upload error:", e);
      Alert.alert("Upload failed", e?.message || "Could not upload image.");
      const stored =
        (user as any)?.profileImage ||
        (user as any)?.user_profile ||
        null;
      setAvatarUri(resolveAvatarUrl(stored));
    } finally {
      setUploading(false);
    }
  };

  // ============================================================
  // Save profile
  // ============================================================
  const handleSaveProfile = async () => {
    if (!userId) return;

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
        `${API_URL}/api/auth/user/${userId}`,
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

      if (login && json.user) {
        const updatedUser = {
          ...(user as any),
          firstName:     json.user.first_name     ?? user?.firstName,
          middleName:    json.user.middle_name    ?? (user as any)?.middleName,
          lastName:      json.user.last_name      ?? user?.lastName,
          contactNumber: json.user.contact_number ?? (user as any)?.contactNumber,
          email:         json.user.email          ?? user?.email,
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

  // ============================================================
  // Logout (modal-based, matches driver flow)
  // ============================================================
  const handleLogoutConfirm = async () => {
    setShowLogoutModal(false);
    try {
      await logout();
    } catch (e) {
      console.warn("[profile] logout error:", e);
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
            {/* ===== HERO / ACCOUNT CARD ===== */}
            <View style={styles.heroCard}>
              <BlurView intensity={40} tint="light" style={styles.blurFill}>
                <View style={styles.heroTop}>
                  {/* Tappable avatar */}
                  <TouchableOpacity
                    onPress={handlePickAvatar}
                    activeOpacity={0.85}
                    disabled={uploading}
                  >
                    <View
                      style={[
                        styles.avatarRing,
                        { borderColor: fareCategory.color + "66" },
                      ]}
                    >
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: fareCategory.color },
                        ]}
                      >
                        {avatarUri ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.avatarImage}
                          />
                        ) : (
                          <Text style={styles.avatarText}>{initials}</Text>
                        )}
                      </View>

                      {/* Camera badge */}
                      <View style={styles.avatarBadge}>
                        {uploading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="camera" size={12} color="#fff" />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>

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
                      <Ionicons name="card-outline" size={11} color={C.muted} />
                      <Text style={styles.idText}>ID • {accountId}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.heroDivider} />

                <View style={styles.statsRow}>
                  <Stat label="FARE" value={fareCategory.short} color={fareCategory.color} />
                  <View style={styles.statSep} />
                  <Stat label="TYPE" value={isDriver ? "Driver" : "Commuter"} color={C.blue} />
                  <View style={styles.statSep} />
                  <Stat
                    label="STATUS"
                    value={user ? "Active" : "Guest"}
                    color={user ? C.teal : C.muted}
                  />
                </View>

                {/* Edit Profile button */}
                <TouchableOpacity
                  style={styles.editBtn}
                  activeOpacity={0.85}
                  onPress={() => setShowEditModal(true)}
                >
                  <Ionicons name="pencil-outline" size={14} color={C.teal} />
                  <Text style={styles.editBtnText}>Edit Profile</Text>
                </TouchableOpacity>
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
                icon="call-outline"
                label="Contact Number"
                value={(user as any)?.contactNumber || "—"}
              />
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
              onPress={() => setShowLogoutModal(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={18} color={C.red} />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>

            <Text style={styles.footer}>Transpo-Go • v1.0.0</Text>

            <View style={{ height: navTotalSpace }} />
          </ScrollView>

          {/* ===== BOTTOM NAV ===== */}
          <View style={[styles.row, { bottom: navBottomOffset }]}>
            <GridNavButton title="Dashboard"   route="/Dashboard"  icon="view-dashboard-outline" active={pathname === "/Dashboard"} />
            <GridNavButton title="Map routes"  route="/mapping"    icon="map-marker-path"        active={pathname === "/mapping"} />
            <GridNavButton title="Fare prices" route="/farePrices" icon="cash-multiple"          active={pathname === "/farePrices"} />
            <GridNavButton title="Profile"     route="/profile"    icon="account-circle"         active={pathname === "/profile"} />
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
                  <Ionicons name="person-circle-outline" size={26} color={C.teal} />
                </View>

                <Text style={styles.editModalTitle}>Edit Profile</Text>
                <Text style={styles.editModalSubtitle}>
                  Update your personal information
                </Text>

                <Field
                  label="First Name"
                  icon="person-outline"
                  value={form.firstName}
                  onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                />
                <Field
                  label="Middle Name"
                  icon="person-outline"
                  value={form.middleName}
                  onChangeText={(v) => setForm((f) => ({ ...f, middleName: v }))}
                  optional
                />
                <Field
                  label="Last Name"
                  icon="person-outline"
                  value={form.lastName}
                  onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                />
                <Field
                  label="Contact Number"
                  icon="call-outline"
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
                  icon="mail-outline"
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
                  icon="lock-closed-outline"
                  value={form.newPassword}
                  onChangeText={(v) => setForm((f) => ({ ...f, newPassword: v }))}
                  secureTextEntry
                  placeholder="Leave empty to keep current"
                />
                <Field
                  label="Confirm Password"
                  icon="lock-closed-outline"
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
              style={styles.logoutModalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.logoutModalIconWrap}>
                <Ionicons name="log-out-outline" size={26} color={C.red} />
              </View>

              <Text style={styles.logoutModalTitle}>Log out?</Text>
              <Text style={styles.logoutModalMessage}>
                Are you sure you want to log out of your account? You can log back in anytime.
              </Text>

              <View style={styles.logoutModalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setShowLogoutModal(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.logoutConfirmBtn]}
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
// Small reusable pieces
// ============================================================
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
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

function Field({
  label, icon, value, onChangeText,
  secureTextEntry, keyboardType, autoCapitalize, placeholder, optional,
  maxLength, onBlur, error, helper,
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
        <Ionicons
          name={icon}
          size={16}
          color={error ? C.red : C.muted}
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
          <Ionicons name="alert-circle-outline" size={12} color={C.red} />
          <Text style={styles.fieldErrorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.fieldHelperText}>{helper}</Text>
      ) : null}
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
  overlay: { flex: 1, backgroundColor: "rgba(255, 255, 255, 0.38)" },
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },

  heroCard: {
    marginBottom: 10,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(233, 240, 238, 0.44)",
  },
  blurFill: { padding: 14 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },

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
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "monsterrat_kp",
    letterSpacing: 1,
  },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  name: { fontSize: 17, fontFamily: "monsterrat_kp", color: C.text, flexShrink: 1 },
  email: { fontSize: 12, fontFamily: "monster_act", color: C.sub, marginBottom: 8 },
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

  statsRow: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 14, fontFamily: "monsterrat_kp", marginBottom: 2 },
  statLabel: {
    fontSize: 9,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    letterSpacing: 1,
    color: C.muted,
  },
  statSep: { width: 0.6, height: 26, backgroundColor: "rgba(217, 230, 227, 0.9)" },

  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(49,144,134,0.10)",
    borderWidth: 1,
    borderColor: "rgba(49,144,134,0.28)",
  },
  editBtnText: {
    fontSize: 12,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: C.teal,
    letterSpacing: 0.3,
  },

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
  rowValue: { fontSize: 13, fontFamily: "monster_act", color: C.text },
  divider: {
    height: 0.6,
    backgroundColor: "rgba(217, 230, 227, 0.9)",
    marginLeft: 60,
  },

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

  // ---------- edit modal ----------
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 30, 28, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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
    color: C.tealDark,
    textAlign: "center",
    marginBottom: 4,
  },
  editModalSubtitle: {
    fontSize: 12,
    fontFamily: "monster_act",
    color: C.muted,
    textAlign: "center",
    marginBottom: 20,
  },

  // ---------- logout modal ----------
  logoutModalCard: {
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
  logoutModalIconWrap: {
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
  logoutModalTitle: {
    fontSize: 18,
    fontFamily: "monsterrat_kp",
    color: "#b03427",
    marginBottom: 6,
  },
  logoutModalMessage: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "monster_act",
    color: "#4a5f5a",
    textAlign: "center",
    marginBottom: 20,
  },
  logoutModalActions: { flexDirection: "row", gap: 10, width: "100%" },
  logoutConfirmBtn: { backgroundColor: C.red },

  // ---------- shared field styles ----------
  fieldWrap: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: C.muted,
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
    color: C.text,
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
    color: C.red,
  },
  fieldHelperText: {
    fontSize: 10.5,
    fontFamily: "monster_act",
    color: C.muted,
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
    color: C.muted,
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

  // ---------- shared modal button styles ----------
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
  modalConfirmBtn: { backgroundColor: C.teal },
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

  // ---------- bottom nav ----------
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