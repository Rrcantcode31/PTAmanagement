import { Stack } from "expo-router";
import { AuthProvider } from "../appContext/authContext" ;

export const API_URL = "https://ptamanagement-production.up.railway.app";

export default function RootLayout() {
  return(
  <AuthProvider>
    <Stack screenOptions={{ headerShown: false }} />
  </AuthProvider>
  );
}
