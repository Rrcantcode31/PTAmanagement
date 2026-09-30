import { Server } from "socket.io";
import { registerDriverHandlers } from "./driverSocket.js";
import { registerAdminHandlers } from "./adminSocket.js";
import { registerQueueHandlers } from "./queueHandlers.js";

let _io = null;

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:4570",
        "http://192.168.1.74:4570",
        "http://localhost:4560",
        "http://192.168.1.74:4560",
        "https://ptamanagement-production.up.railway.app",
        "https://pta-management-4yrprjct.up.railway.app"
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