import { Server } from "socket.io";
import { registerDriverHandlers } from "./driverSocket.js";
import { registerAdminHandlers } from "./adminSocket.js";
import { registerQueueHandlers } from "./queueHandlers.js";

let _io = null;

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
      "https://pta-management-admin.up.railway.app",
      "https://mobile-backend-application.up.railway.app"
    ],
      credentials: true,
    },
  });

  _io = io;

  io.on("connection", (socket) => {
    registerDriverHandlers(io, socket);
    registerAdminHandlers(io, socket);
    registerQueueHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}

export function getIO() {
  if (!_io) {
    throw new Error("Socket.IO not initialized — call initSocket(server) first");
  }
  return _io;
}