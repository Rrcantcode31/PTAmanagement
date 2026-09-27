import { Stack } from "expo-router";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from "../appContext/authContext";

export const API_URL = "http://192.168.1.74:4570";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
} 