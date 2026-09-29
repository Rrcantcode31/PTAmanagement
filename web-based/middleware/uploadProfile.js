// web-based/middleware/uploadProfile.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads", "profiles");

// Create the folder if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const adminId = req.session?.adminAuth?.admin_id || "unknown";
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `admin_${adminId}_${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only JPG, PNG, WEBP, or GIF images are allowed."));
}

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },  // 3 MB max
});