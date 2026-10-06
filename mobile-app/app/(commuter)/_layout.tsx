// app/(commuter)/_layout.tsx
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../appContext/authContext";

export default function CommuterLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Redirect href="/" />;
  if (user.type === "driver") {
    return <Redirect href="/driverApp/driverDashboard" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}