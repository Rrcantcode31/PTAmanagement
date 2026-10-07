import express from 'express';
import 
{ signup, login, getRoles, 
GetAllTerminalLocations, getFarePrices, getDriverQueue, getDriverDepartures,
getTerminalQueue, getNearbyTerminals, getTripEstimate, getDriverStats,  updateUser, updateDriver, updateDriverAvatar} from '../Controller/androidController.js';
import { uploadAvatar } from "../middleware/upload.js";
import { verifyToken, requireType,  requireSelfOrAdmin } from '../middleware/authMiddleware.js'


const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);

//Get data request
router.get('/getRoles', getRoles);
router.get('/terminalQueue', verifyToken, getTerminalQueue);
router.get('/getTerminalsLocation', verifyToken, GetAllTerminalLocations);
router.get('/Fare', verifyToken, requireType('driver', 'user'), getFarePrices);
router.get('/driverQueue', verifyToken, requireType('driver', 'user'), getDriverQueue);
router.get('/nearbyTerminals', verifyToken, getNearbyTerminals);
router.get('/tripEstimate', verifyToken, getTripEstimate);
router.get("/driverStats", verifyToken, requireType('driver'), getDriverStats);
router.get("/driverDepartures", verifyToken, requireType('driver', 'admin'), getDriverDepartures);

//PUT data response
router.put("/user/:id",verifyToken ,updateUser);

router.put("/driver/:id", verifyToken, requireType( 'driver', 'admin'),
  requireSelfOrAdmin((req) => Number(req.params.id)),
  updateDriver
);

router.put("/driver/:id/avatar", verifyToken, requireSelfOrAdmin((req) => Number(req.params.id)), 
 uploadAvatar.single("avatar"), 
 updateDriverAvatar);



export default router;