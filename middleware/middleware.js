const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    console.log(token, "token");
    console.log(process.env.JWT_SECRET, "process env");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

const roleMiddleware = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: "Denied" });
  }
  next();
};

const cvUploadMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (req.user.role !== "user") {
    return res.status(403).json({ message: "Only users can upload CVs" });
  }
  next();
};

const saveJobMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Please register to save a job" });
  }
  if (req.user.role !== "user") {
    return res.status(403).json({ message: "Only users can save jobs" });
  }
  next();
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

const authMiddlewareOptional = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ message: "you dont have permition" });

  const token = authHeader.split(" ")[1];
  if (!token)
    return res.status(401).json({ message: "you dont have permition" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded, "decoded");
    req.user = await User.findById(decoded.id);
    next();
  } catch (err) {
    console.warn("Invalid token skipping context");
    console.log(err, "middlware error");
    next();
  }
};

module.exports = {
  authMiddleware,
  roleMiddleware,
  cvUploadMiddleware,
  saveJobMiddleware,
  adminMiddleware,
  authMiddlewareOptional,
};
