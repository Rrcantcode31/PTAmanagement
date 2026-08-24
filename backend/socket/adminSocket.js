export function registerAdminHandlers(io, socket) {
  socket.on("admin:subscribe", () => {
    socket.join("admins");
  });
}