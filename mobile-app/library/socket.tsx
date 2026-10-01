import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(token: string) {
  if (!socket) {
    socket = io("https://mobile-backend-application.up.railway.app", {
      auth: { token },
    });
  }
  return socket;
}