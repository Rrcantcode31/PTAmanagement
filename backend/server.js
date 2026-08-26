import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initSocket } from "./socket/mainSocket.js";

// Load environment variables
dotenv.config();

// Initialize app
const app = express();

// ================= MIDDLEWARE =================
app.use(cors({
    origin: [
      "http://localhost:4570",
      "http://192.168.1.74:4570",
      "http://localhost:4560",
      "http://192.168.1.74:4560",
      "https://pta-management-4yrprjct.up.railway.app"
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ================= ROUTES =================
import authRoutes from "./routes/authRoutes.js";
// import userRoutes from "./routes/userRoutes.js";
// import transportRoutes from "./routes/transportRoutes.js";

app.use("/api/auth", authRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/transport", transportRoutes);

// ================= TEST ROUTE =================
app.get("/", (req, res) => {
    res.send("🚀 PTA Management Backend Running");
});

// ================= SERVER + SOCKET.IO =================
const PORT = process.env.PORT || 4570;

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});