import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(token: string) {
  if (!socket) {
    socket = io("https://192.168.1.74/4570", {
      auth: { token },
    });
  }
  return socket;
}