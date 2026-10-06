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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import axios from "axios";
import { API_URL } from "./_layout";

import { useAuth } from "../appContext/authContext";

type ModalState = {
  visible: boolean;
  type: "error" | "success" | "info";
  title: string;
  message: string;
  onConfirm?: () => void; // Added to handle success navigation
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const { login } = useAuth();

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    type: "error",
    title: "",
    message: "",
  });

  const showModal = (
    type: ModalState["type"],
    title: string,
    message: string,
    onConfirm?: () => void
  ) => {
    setModal({ visible: true, type, title, message, onConfirm });
  };

  const closeModal = () =>
    setModal((m) => ({ ...m, visible: false }));

  const handleModalConfirm = () => {
    closeModal();
    if (modal.onConfirm) {
      modal.onConfirm();
    }
  };

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
    digitalFont: require("../assets/Font/digitalFont.ttf"),
  });

  if (!fontsLoaded) return null;

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showModal(
        "error",
        "Missing details",
        "Please enter both your email and password."
      );
      return;
    }

    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, {
        email: email.trim(),
        password,
      });

      if (res.data.success) {
        const user = res.data.user;
        await login(user, res.data.token);

        // Show success modal and pass the navigation logic as onConfirm
        showModal(
          "success",
          "Welcome back!",
          res.data.message || "Login successful.",
          () => {
            if (user.type === "driver") {
              router.replace("/driverApp/driverDashboard");
            } else {
              router.replace("/Dashboard");
            }
          }
        );
      } else {
        showModal(
          "error",
          "Login failed",
          res.data.message || "Invalid credentials. Please try again."
        );
      }
    } catch (error: any) {
      console.log(error.response?.data || error.message);

      const data = error.response?.data;
      let message = "Something went wrong. Please try again.";

      if (data) {
        if (typeof data === "string") {
          message = data;
        } else if (typeof data.message === "string") {
          message = data.message;
        } else if (typeof data.error === "string") {
          message = data.error;
        } else if (Array.isArray(data.errors) && data.errors.length) {
          message = data.errors.join("\n");
        } else if (data.errors && typeof data.errors === "object") {
          message = Object.values(data.errors).flat().join("\n");
        }
      } else if (error.request) {
        message = "Cannot reach the server. Please check your connection.";
      } else {
        message = error.message || message;
      }

      showModal("error", "Login failed", message);
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
        <View style={styles.container}>
          <BlurView intensity={35} tint="light" style={styles.loginCard}>
            
            <Text style={styles.cardTitle}>Login</Text>

            {/* ===== USERNAME INPUT ===== */}
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={18}
                color="#7f9f97"
                style={styles.inputIcon}
              />
              <TextInput
                placeholder="Username / Email"
                placeholderTextColor="#7f9f97"
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>

            {/* ===== PASSWORD INPUT ===== */}
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
                secureTextEntry
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                autoCapitalize="none"
              />
            </View>

            {/* ===== REMEMBER ME + FORGOT PASSWORD (same row) ===== */}
            <View style={styles.metaRow}>
              <TouchableOpacity
                style={styles.rememberRow}
                activeOpacity={0.7}
                onPress={() => setRememberMe((v) => !v)}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  )}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.forgotWrap}
                onPress={() =>
                  showModal("info", "Reset password", "Password reset flow coming soon.")
                }
              >
                <Text style={styles.forgotLink}>Forgot your password?</Text>
              </TouchableOpacity>
            </View>

            {/* ===== LOGIN BUTTON ===== */}
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.loginBtnText}>LOGIN</Text>
            </TouchableOpacity>

            {/* ===== SIGN UP LINK ===== */}
            <TouchableOpacity onPress={() => router.push("/Signup")}>
              <Text style={styles.signupLink}>
                Don't have an account? <Text style={styles.signupLinkBold}>Sign-up</Text>
              </Text>
            </TouchableOpacity>

          </BlurView>
        </View>

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
                  size={28} // Slightly larger icon for success
                  color={theme.iconColor}
                />
              </View>

              <Text style={[styles.modalTitle, { color: theme.titleColor }]}>
                {modal.title}
              </Text>

              <Text style={styles.modalMessage}>{modal.message}</Text>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.buttonBg }]}
                onPress={handleModalConfirm}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonText}>
                  {modal.type === "success" ? "Go to Dashboard" : "Got it"}
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
        iconColor: "#2ECC8F", // Vibrant success green
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

  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 80,
  },

  // ============================================================
  // GLASS LOGIN CARD
  // ============================================================
  loginCard: {
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
    marginBottom: 16,
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

  /// ---------- remember me + forgot password (single row) ----------
metaRow: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 24,
  gap: 12,
},

rememberRow: {
  flexDirection: "row",
  alignItems: "center",
  flexShrink: 1,
},

checkbox: {
  width: 18,
  height: 18,
  borderRadius: 5,
  borderWidth: 1.5,
  borderColor: "#7f9f97",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
  backgroundColor: "rgba(255,255,255,0.3)",
},

checkboxChecked: {
  backgroundColor: "#319086",
  borderColor: "#319086",
},

rememberText: {
  fontSize: 13,
  fontFamily: "monster_act",
  color: "#4a5f5a",
},

forgotWrap: {
  // no alignSelf: "flex-end" anymore — the parent row handles positioning
},

forgotLink: {
  color: "#4384ac",
  fontSize: 12,
  fontFamily: "monsterrat_font",
  fontWeight: "600",
},

  // ---------- login button ----------
  loginBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
    marginBottom: 20,
  },

  loginBtnText: {
    color: "#1f6f66",
    fontSize: 16,
    fontFamily: "monsterrat_kp",
    letterSpacing: 3,
  },

  // ---------- signup link ----------
  signupLink: {
    textAlign: "center",
    color: "#4a5f5a",
    fontSize: 13,
    fontStyle: "italic",
    fontFamily: "monster_act",
  },

  signupLinkBold: {
    color: "#2b5f80",
    fontFamily: "monsterrat_font",
    fontWeight: "700",
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
    paddingTop: 32, // Increased top padding
    paddingBottom: 28, // Increased bottom padding
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },

  modalIconWrap: {
    width: 64, // Slightly larger badge
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    marginBottom: 16,
  },

  modalTitle: {
    fontSize: 20, // Slightly larger title
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