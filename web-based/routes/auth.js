const express = require('express');
const router = express.Router();
const authController = require('../controller/backendController');


//authencticaion
router.post('/Login', authController.Login);
//end session
router.get('/Logout', authController.logout);

//Admin protected functions
router.post('/AddTerminalLocation', authController.isLoggedIn, authController.AddterminalLocation);
router.patch('/UpdateTerminalLocation', authController.isLoggedIn, authController.UpdateTerminalLocation);
router.post('/InsertDriverInfo', authController.isLoggedIn, authController.InsertDriverCred);
router.post('/InsertFarePrice', authController.isLoggedIn, authController.InsertFarePrice);
router.post('/postDispatchAreaZone', authController.isLoggedIn, authController.postDispatchZoneArea);
router.put('/putDispatchAreaZone/:zone_id', authController.isLoggedIn, authController.putDispatchZoneArea);

//Admin get data
router.get('/terminals', authController.isLoggedIn, authController.GetAllTerminalLocations);
router.get('/getDriverInfo', authController.isLoggedIn, authController.getDriverInfo);
router.get('/getVehicles', authController.isLoggedIn, authController.getVehicles);
router.get('/getFarePrice', authController.isLoggedIn, authController.getFarePrices);
router.get('/getDispatchAreZone', authController.isLoggedIn, authController.getDispatchZoneArea);

//Admin delete function
router.delete('/DeleteDriverInfo', authController.isLoggedIn, authController.DeleteDriverInfo);
router.delete('/DeleteTerminalLocation/:terminal_id', authController.isLoggedIn, authController.DeleteTerminalLocation);


module.exports = router;