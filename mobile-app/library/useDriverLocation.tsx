// app/driverApp/useDriverLocation.ts
import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { getSocket } from "./socket";

export function useDriverLocation(driverId: number | null, token: string | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!driverId || !token) return;

    const driverIdConfirmed = driverId;
    const tokenConfirmed = token;

    const socket = getSocket(tokenConfirmed);

    socket.on("connect", () => {
      console.log("Driver socket connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("Driver socket connection failed:", err.message);
    });

    const sendLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          console.log("Location permission denied");
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const { latitude, longitude } = location.coords;

        console.log("Emitting driver location:", latitude, longitude);

        socket.emit("location:update", {
          driverId: driverIdConfirmed,
          latitude,
          longitude,
        });

      } catch (error) {
        console.error("Error getting/sending driver location:", error);
      }
    };

    // Send immediately, then repeat every 5 seconds
    sendLocation();
    intervalRef.current = setInterval(sendLocation, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [driverId, token]);
}