// app/driverApp/useDriverLocation.ts

import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { getSocket } from "./socket";

export function useDriverLocation(
  driverId: number | null,
  token: string | null
) {
  const locationSubscriptionRef =
    useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!driverId || !token) return;

    const driverIdConfirmed = driverId;
    const tokenConfirmed = token;

    const socket = getSocket(tokenConfirmed);

    socket.on("connect", () => {
      console.log("Driver socket connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error(
        "Driver socket connection failed:",
        err.message
      );
    });

    const startLocationTracking = async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          console.log("Location permission denied");
          return;
        }

        const subscription =
          await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 5000,
              distanceInterval: 0,
            },
            (location) => {
              const {
                latitude,
                longitude,
                accuracy,
              } = location.coords;

              console.log(
                "Emitting driver location:",
                latitude,
                longitude,
                "accuracy:",
                accuracy
              );

              socket.emit("location:update", {
                driverId: driverIdConfirmed,
                latitude,
                longitude,
              });
            }
          );

        locationSubscriptionRef.current = subscription;

      } catch (error) {
        console.error(
          "Error starting location tracking:",
          error
        );
      }
    };

    startLocationTracking();

    return () => {
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }

      socket.off("connect");
      socket.off("connect_error");
    };
  }, [driverId, token]);
}