import React from "react";
import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Href } from "expo-router";

type GridNavButtonProps = {
  title: string;
  route: Href;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  active?: boolean;
};

export default function GridNavButton({
  title,
  route,
  icon,
  active,
}: GridNavButtonProps) {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => router.replace(route)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, active && styles.activeGlow]}>
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={active ? "#00F0FF" : "rgba(255, 255, 255, 0.6)"}
        />
      </View>
      <Text style={[styles.text, active && styles.activeText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1, // Expands to fill available width evenly
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  activeGlow: {
    shadowColor: "#00F0FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  text: {
    fontSize: 9,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 1,
  },
  activeText: {
    color: "#00F0FF",
    fontWeight: "600",
    textShadowColor: "rgba(0, 240, 255, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
});