import jwToken from "jsonwebtoken";


// verifyToken — is there a valid JWT?
export const verifyToken = (req, res, next) => {
    const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.TOKEN_PASSWORD);
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// requireType — 'driver' or 'user'
export const requireType = (...allowedTypes) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }
  if (!allowedTypes.includes(req.user.type)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};

// requireRole — role_name like 'Student', 'Admin'
export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};