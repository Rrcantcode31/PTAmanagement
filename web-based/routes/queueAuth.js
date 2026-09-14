const express = require('express');
const router = express.Router();
const queueController = require("../controller/queueController");
const { isLoggedIn } = require("../controller/backendController");

router.get ("/", isLoggedIn, queueController.getQueueByZone);

router.post("/dispatchDriver", isLoggedIn, queueController.dispatchDriver);

router.get("/getDepartureLogs", isLoggedIn, queueController.getDepartureLogs);

module.exports = router;