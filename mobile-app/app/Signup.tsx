import { useState } from "react";
import {
  Text,
  View,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ImageBackground,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import axios from "axios";
import { API_URL } from "./_layout";

type ModalState = {
  visible: boolean;
  type: "error" | "success" | "info";
  title: string;
  message: string;
  onConfirm?: () => void;
};

const FARE_OPTIONS = [
  { label: "Regular", value: "regular", icon: "person-outline" },
  { label: "Student", value: "student", icon: "school-outline" },
  { label: "PWD",     value: "pwd",     icon: "accessibility-outline" },
  { label: "Senior",  value: "senior",  icon: "person-circle-outline" },
] as const;

// ============================================================
// Validation helpers
// ============================================================
const CONTACT_DIGITS = 11;

/** Strips everything that isn't a digit and hard-stops at 11 digits. */
function sanitizeContactNumber(raw: string): string {
  return (raw || "").replace(/[^0-9]/g, "").slice(0, CONTACT_DIGITS);
}

/**
 * Contact number is OPTIONAL if email is provided.
 * - Empty is fine, UNLESS email is also empty.
 * - If filled in, it must be exactly 11 digits.
 */
function validateContactNumber(raw: string, email: string): string | null {
  const value = (raw || "").trim();
  const emailValue = (email || "").trim();

  if (!value) {
    if (!emailValue) return "Please provide either an email or a contact number.";
    return null; // optional if email is provided
  }

  if (!/^\d+$/.test(value)) return "Contact number must contain digits only.";
  if (value.length !== CONTACT_DIGITS) {
    return `Contact number must be exactly ${CONTACT_DIGITS} digits.`;
  }
  return null;
}

function validateEmail(raw: string, contactNumber: string): string | null {
  const email = (raw || "").trim();
  const contact = (contactNumber || "").trim();

  if (!email) {
    if (!contact) return "Please provide either an email or a contact number.";
    return null; // optional if contact number is provided
  }
  
  if (/\s/.test(email)) return "Email cannot contain spaces.";
  if (email.includes("..")) return "Email cannot contain two dots in a row.";

  const atCount = (email.match(/@/g) || []).length;
  if (atCount === 0) return "Email is incomplete — it must contain an @ symbol.";
  if (atCount > 1) return "Email can only contain one @ symbol.";

  const [localPart, domainPart] = email.split("@");

  if (!localPart) return "Enter your username before the @ symbol.";
  if (!domainPart) return "Email is incomplete — add a domain after the @.";
  if (!domainPart.includes(".")) return "Email domain is invalid.";

  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?$/.test(localPart)) {
    return "That email username is not valid.";
  }

  return null;
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [fareCategory, setFareCategory] = useState("regular");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    contactNumber?: string;
  }>({});

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    type: "error",
    title: "",
    message: "",
  });

  // ---- Live password match check ----
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const showModal = (
    type: ModalState["type"],
    title: string,
    message: string,
    onConfirm?: () => void
  ) => {
    setModal({ visible: true, type, title, message, onConfirm });
  };

  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  const handleModalConfirm = () => {
    closeModal();
    if (modal.onConfirm) modal.onConfirm();
  };

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
    digitalFont: require("../assets/Font/digitalFont.ttf"),
  });

  if (!fontsLoaded) return null;

  const handleRegister = async () => {
    // Required field check (email and contact number are mutually required)
    if (!password.trim() || !firstName.trim() || !lastName.trim()) {
      showModal(
        "error",
        "Missing details",
        "Please fill in your password, first name, and last name."
      );
      return;
    }

    // Email + contact validation (at least one required)
    const emailError   = validateEmail(email, contactNumber);
    const contactError = validateContactNumber(contactNumber, email);

    if (emailError || contactError) {
      setFieldErrors({
        email: emailError || undefined,
        contactNumber: contactError || undefined,
      });
      showModal(
        "error",
        "Please check your details",
        emailError || contactError || "Some fields are invalid."
      );
      return;
    }
    setFieldErrors({});

    // Password match check
    if (password !== confirmPassword) {
      showModal(
        "error",
        "Passwords don't match",
        "Please make sure both password fields are identical."
      );
      return;
    }

    // Minimum length check
    if (password.length < 6) {
      showModal(
        "error",
        "Password too short",
        "Your password must be at least 6 characters long."
      );
      return;
    }

    try {
      const res = await axios.post(`${API_URL}/api/auth/signup`, {
        email: email.trim().toLowerCase() || null, // Send null if empty
        password,
        firstName: firstName.trim(),
        middleName: middleName.trim(),
        lastName: lastName.trim(),
        contactNumber: contactNumber.trim() || null, // Send null if empty
        fareCategory,
      });

      if (res.data.success) {
        showModal(
          "success",
          "Welcome aboard!",
          res.data.message || "Your account has been created successfully.",
          () => router.replace("/")
        );
      } else {
        showModal(
          "error",
          "Sign-up failed",
          res.data.message || "Please try again."
        );
      }
    } catch (error: any) {
      console.log("Signup error:", error.response?.data || error.message);

      const data = error.response?.data;
      let message = "Something went wrong. Please try again.";

      if (typeof data === "string") {
        message = data;
      } else if (typeof data?.message === "string") {
        message = data.message;
      } else if (typeof data?.error === "string") {
        message = data.error;
      } else if (Array.isArray(data?.errors) && data.errors.length) {
        message = data.errors.join("\n");
      } else if (data?.errors && typeof data.errors === "object") {
        message = Object.values(data.errors).flat().join("\n");
      } else if (error.request) {
        message = "Cannot reach the server. Please check your connection.";
      } else {
        message = error.message || message;
      }

      showModal("error", "Sign-up failed", message);
    }
  };

  const theme = getModalTheme(modal.type);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ImageBackground
        source={require("../assets/images/main-bg.png")}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <BlurView intensity={35} tint="light" style={styles.signupCard}>
            <Text style={styles.cardTitle}>Sign-up</Text>

            {/* ===== EMAIL ===== */}
            <View
              style={[
                styles.inputWrapper,
                fieldErrors.email && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={18}
                color={fieldErrors.email ? "#e74c3c" : "#7f9f97"}
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Email (optional if contact is provided)"
                placeholderTextColor="#7f9f97"
                style={styles.input}
                onChangeText={(v) => {
                  setEmail(v);
                  if (fieldErrors.email) {
                    setFieldErrors((e) => ({ ...e, email: undefined }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((e) => ({
                    ...e,
                    email: validateEmail(email, contactNumber) || undefined,
                  }))
                }
                value={email}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>
            {fieldErrors.email ? (
              <View style={styles.fieldHintRow}>
                <Ionicons name="alert-circle-outline" size={12} color="#e74c3c" />
                <Text style={styles.fieldHintError}>{fieldErrors.email}</Text>
              </View>
            ) : (
              <Text style={styles.fieldHint}>
                If email is unavailable, you can proceed to use a contact number.
              </Text>
            )}

            {/* ===== PASSWORD ===== */}
            <View style={styles.inputWrapper}>
              <Ionicons
                name="key-outline"
                size={18}
                color="#7f9f97"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Password"
                placeholderTextColor="#7f9f97"
                secureTextEntry={!showPassword}
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#7f9f97"
                />
              </TouchableOpacity>
            </View>

            {/* ===== CONFIRM PASSWORD ===== */}
            <View
              style={[
                styles.inputWrapper,
                passwordsMismatch && styles.inputWrapperError,
                passwordsMatch && styles.inputWrapperSuccess,
              ]}
            >
              <Ionicons
                name="key-outline"
                size={18}
                color="#7f9f97"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Confirm Password"
                placeholderTextColor="#7f9f97"
                secureTextEntry={!showConfirmPassword}
                style={styles.input}
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                autoCapitalize="none"
              />
              {passwordsMatch && (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="#2ECC8F"
                  style={{ marginRight: 8 }}
                />
              )}
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((v) => !v)}
                hitSlop={8}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#7f9f97"
                />
              </TouchableOpacity>
            </View>

            {/* Live mismatch hint */}
            {passwordsMismatch && (
              <Text style={styles.matchHintError}>
                Passwords don't match yet
              </Text>
            )}

            {/* ===== FIRST NAME ===== */}
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={18}
                color="#7f9f97"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="First Name"
                placeholderTextColor="#7f9f97"
                style={styles.input}
                onChangeText={setFirstName}
                value={firstName}
                autoCapitalize="words"
              />
            </View>

            {/* ===== MIDDLE NAME ===== */}
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={18}
                color="#7f9f97"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Middle Name (optional)"
                placeholderTextColor="#7f9f97"
                style={styles.input}
                onChangeText={setMiddleName}
                value={middleName}
                autoCapitalize="words"
              />
            </View>

            {/* ===== LAST NAME ===== */}
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={18}
                color="#7f9f97"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Last Name"
                placeholderTextColor="#7f9f97"
                style={styles.input}
                onChangeText={setLastName}
                value={lastName}
                autoCapitalize="words"
              />
            </View>

            {/* ===== CONTACT NUMBER (optional if email is provided) ===== */}
            <View
              style={[
                styles.inputWrapper,
                fieldErrors.contactNumber && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="call-outline"
                size={18}
                color={fieldErrors.contactNumber ? "#e74c3c" : "#7f9f97"}
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Contact Number (optional if email is provided)"
                placeholderTextColor="#7f9f97"
                style={styles.input}
                onChangeText={(v) => {
                  setContactNumber(sanitizeContactNumber(v));
                  if (fieldErrors.contactNumber) {
                    setFieldErrors((e) => ({ ...e, contactNumber: undefined }));
                  }
                }}
                onBlur={() =>
                  setFieldErrors((e) => ({
                    ...e,
                    contactNumber:
                      validateContactNumber(contactNumber, email) || undefined,
                  }))
                }
                value={contactNumber}
                keyboardType="phone-pad"
                maxLength={CONTACT_DIGITS}
              />
            </View>
            {fieldErrors.contactNumber ? (
              <View style={styles.fieldHintRow}>
                <Ionicons name="alert-circle-outline" size={12} color="#e74c3c" />
                <Text style={styles.fieldHintError}>
                  {fieldErrors.contactNumber}
                </Text>
              </View>
            ) : null}

            {/* ===== FARE CATEGORY ===== */}
            <Text style={[styles.fieldLabel, { marginTop: 6 }]}>
              FARE CATEGORY
            </Text>

            <View style={styles.pillRow}>
              {FARE_OPTIONS.map((opt) => {
                const active = fareCategory === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setFareCategory(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={13}
                      color={active ? "#fff" : "#319086"}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        active && styles.pillTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.disclaimer}>
              Fare category is self-declared. You'll need to present a valid ID
              to the driver to claim discounts.
            </Text>

            {/* ===== SIGN-UP BUTTON ===== */}
            <TouchableOpacity
              style={styles.signupBtn}
              onPress={handleRegister}
              activeOpacity={0.85}
            >
              <Text style={styles.signupBtnText}>SIGN-UP</Text>
            </TouchableOpacity>

            {/* ===== LOGIN LINK ===== */}
            <TouchableOpacity onPress={() => router.push("/")}>
              <Text style={styles.loginLink}>
                Already have an account?{" "}
                <Text style={styles.loginLinkBold}>Login</Text>
              </Text>
            </TouchableOpacity>
          </BlurView>
        </ScrollView>

        {/* ===== CUSTOM MODAL ===== */}
        <Modal
          visible={modal.visible}
          transparent
          animationType="fade"
          onRequestClose={closeModal}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal}>
            <Pressable
              style={styles.modalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View
                style={[
                  styles.modalIconWrap,
                  {
                    backgroundColor: theme.iconBg,
                    borderColor: theme.iconBorder,
                  },
                ]}
              >
                <Ionicons
                  name={theme.icon}
                  size={28}
                  color={theme.iconColor}
                />
              </View>

              <Text style={[styles.modalTitle, { color: theme.titleColor }]}>
                {modal.title}
              </Text>

              <Text style={styles.modalMessage}>{modal.message}</Text>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: theme.buttonBg },
                ]}
                onPress={handleModalConfirm}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonText}>
                  {modal.type === "success" ? "Go to Login" : "Got it"}
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </ImageBackground>
    </SafeAreaView>
  );
}

// ---------- modal theme helper ----------
function getModalTheme(type: ModalState["type"]) {
  switch (type) {
    case "success":
      return {
        icon: "checkmark-circle" as const,
        iconColor: "#2ECC8F",
        iconBg: "rgba(46, 204, 143, 0.12)",
        iconBorder: "rgba(46, 204, 143, 0.28)",
        titleColor: "#1f6f66",
        buttonBg: "#2ECC8F",
      };
    case "info":
      return {
        icon: "information-circle" as const,
        iconColor: "#4384ac",
        iconBg: "rgba(67, 132, 172, 0.12)",
        iconBorder: "rgba(67, 132, 172, 0.28)",
        titleColor: "#2b5f80",
        buttonBg: "#4384ac",
      };
    case "error":
    default:
      return {
        icon: "alert-circle" as const,
        iconColor: "#e74c3c",
        iconBg: "rgba(231, 76, 60, 0.12)",
        iconBorder: "rgba(231, 76, 60, 0.28)",
        titleColor: "#b03427",
        buttonBg: "#e74c3c",
      };
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 30,
  },

  // ============================================================
  // GLASS SIGNUP CARD
  // ============================================================
  signupCard: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.45)",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },

  cardTitle: {
    fontSize: 28,
    fontFamily: "monsterrat_kp",
    color: "#1f6f66",
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: 1,
  },

  // ---------- inputs ----------
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.20)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
    paddingHorizontal: 16,
    marginBottom: 14,
  },

  inputWrapperError: {
    borderColor: "rgba(231, 76, 60, 0.55)",
    backgroundColor: "rgba(231, 76, 60, 0.06)",
  },

  inputWrapperSuccess: {
    borderColor: "rgba(46, 204, 143, 0.55)",
    backgroundColor: "rgba(46, 204, 143, 0.06)",
  },

  inputIcon: {
    marginRight: 12,
  },

  input: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: "monster_act",
    fontSize: 14,
    color: "#1f3d38",
  },

  fieldHint: {
    fontSize: 10.5,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
    fontStyle: "italic",
  },

  fieldHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
  },
  fieldHintError: {
    flex: 1,
    fontSize: 10.5,
    fontFamily: "monster_act",
    color: "#e74c3c",
  },

  matchHintError: {
    fontSize: 11,
    fontFamily: "monster_act",
    color: "#e74c3c",
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
    fontStyle: "italic",
  },

  // ---------- fare category ----------
  fieldLabel: {
    fontSize: 10,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#7f9f97",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 2,
  },

  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(49, 144, 134, 0.3)",
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },

  pillActive: {
    backgroundColor: "#319086",
    borderColor: "#319086",
  },

  pillText: {
    fontSize: 12,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    color: "#319086",
    letterSpacing: 0.3,
  },

  pillTextActive: {
    color: "#fff",
  },

  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "monster_act",
    color: "#7f9f97",
    marginBottom: 20,
    fontStyle: "italic",
  },

  // ---------- sign-up button ----------
  signupBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    marginBottom: 20,
  },

  signupBtnText: {
    color: "#1f6f66",
    fontSize: 16,
    fontFamily: "monsterrat_kp",
    letterSpacing: 3,
  },

  // ---------- login link ----------
  loginLink: {
    textAlign: "center",
    color: "#4a5f5a",
    fontSize: 13,
    fontStyle: "italic",
    fontFamily: "monster_act",
  },

  loginLinkBold: {
    color: "#2b5f80",
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    fontStyle: "normal",
  },

  // ============================================================
  // MODAL
  // ============================================================
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
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },

  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    marginBottom: 16,
  },

  modalTitle: {
    fontSize: 20,
    fontFamily: "monsterrat_kp",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.2,
  },

  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "monster_act",
    color: "#4a5f5a",
    textAlign: "center",
    marginBottom: 24,
  },

  modalButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },

  modalButtonText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "monsterrat_font",
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});