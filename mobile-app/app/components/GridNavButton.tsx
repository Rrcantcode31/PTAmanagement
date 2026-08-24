import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Href} from "expo-router";

// ✅ DEFINE TYPES HERE
type GridNavButtonProps = {
  title: string;
  route: Href;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  active?: boolean; // optional
};

export default function GridNavButton({
  title,
  route,
  icon,
  active,
}: GridNavButtonProps) {
  return (
    <TouchableOpacity 
      style={[styles.button, active && styles.activeButton]} 
      onPress={() => router.replace(route)}
    >
      <MaterialCommunityIcons 
        name={icon} 
        size={17} 
        color={active ? "#00c3ff" : "#555"} 
      />
      <Text style={[styles.text, active && styles.activeText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    padding: 10,
  },
  text: {
    fontSize: 10,
    color: "#555",
  },

  // ACTIVE STYLE
  activeButton: {
    backgroundColor: "#e6f0ff",
    borderRadius: 15,

  },
  
  activeText: {
    color: "#00c3ff",
    fontWeight: "bold",
  },
});