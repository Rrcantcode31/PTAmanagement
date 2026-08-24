import { Server } from "socket.io";
import { registerDriverHandlers } from "./driverSocket.js";
import { registerAdminHandlers } from "./adminSocket.js";

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:4570",
        "http://192.168.1.74:4570",
        "http://localhost:4560",
        "http://192.168.1.74:4560"
      ],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    registerDriverHandlers(io, socket);
    registerAdminHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
}