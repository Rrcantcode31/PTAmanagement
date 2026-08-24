import { Stack } from "expo-router";
import { useAuth } from "../../appContext/authContext";
import { useDriverLocation } from "../../library/useDriverLocation";

export default function DriverAppLayout() {
  const { user, token } = useAuth();

  useDriverLocation(user?.id ?? null, token ?? null);

  return <Stack screenOptions={{ headerShown: false }} />;
}