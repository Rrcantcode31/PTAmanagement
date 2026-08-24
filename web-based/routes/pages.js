const express = require("express");
const router = express.Router();
const authController = require("../controller/backendController");

router.get("/", (req, res) => {
    res.redirect("/Login");
});

function ViewLogin(req, res) {
  if (req.session.adminAuth) {
    return res.redirect("/Dashboard");
  }
  return res.render("Login");
}
router.get("/Login", ViewLogin);

function ViewHome(req, res) {
  if (req.session.adminAuth) {
    return res.render("Dashboard.hbs", { 
      activePage: "dashboard",
      adminAuth: req.session.adminAuth || res.locals.adminAuth
    });
  }
  return res.redirect("/Login");
}
router.get("/Dashboard", authController.isLoggedIn, ViewHome);

function ViewList(req, res) {
  if (req.session.adminAuth) {
    return res.render("DriverList.hbs", { 
      activePage: "driverlist",
      adminAuth: req.session.adminAuth || res.locals.adminAuth
    });
  }
  return res.redirect("/Login");
}
router.get("/DriverList", authController.isLoggedIn, ViewList);

function ViewLogs(req, res) {
  if (req.session.adminAuth) {
    return res.render("DepartureLog.hbs", { 
      activePage: "departurelog",
      adminAuth: req.session.adminAuth || res.locals.adminAuth
    });
  }
  return res.redirect("/Login");
}
router.get("/DepartureLogs", authController.isLoggedIn, ViewLogs);

function ViewRoute(req, res) {
  if (req.session.adminAuth) {
    return res.render("SCroute.hbs", { 
      activePage: "scroute",
      adminAuth: req.session.adminAuth || res.locals.adminAuth
    });
  }
  return res.redirect("/Login");
}
router.get("/SCroute", authController.isLoggedIn, ViewRoute);

function ViewVehicles(req, res) {
  if (req.session.adminAuth) {
    return res.render("vehicles.hbs", { 
      activePage: "vehicles",
      adminAuth: req.session.adminAuth || res.locals.adminAuth
    });
  }
  return res.redirect("/Login");
}
router.get("/vehicles", authController.isLoggedIn, ViewVehicles);

function ViewFare(req, res) {
  if (req.session.adminAuth) {
    return res.render("farePrice.hbs", { 
      activePage: "fareprice",
      adminAuth: req.session.adminAuth || res.locals.adminAuth
    });
  }
  return res.redirect("/Login");
}
router.get("/farePrice", authController.isLoggedIn, ViewFare);

function ViewQueue(req, res) {
  if (req.session.adminAuth) {
    return res.render("sample3D.hbs", {
      activePage: "view3D", 
      adminAuth: req.session.adminAuth || res.locals.adminAuth
    });
  }
  return res.redirect("/Login");
}
router.get("/sample3D", authController.isLoggedIn, ViewQueue);


module.exports = router;