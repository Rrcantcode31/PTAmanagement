import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(token: string) {
  if (!socket) {
    socket = io("https://ptamanagement-production.up.railway.app", {
      auth: { token },
    });
  }
  return socket;
}