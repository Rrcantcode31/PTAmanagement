import express from 'express';
import 
{ signup, login, getRoles, 
GetAllTerminalLocations, getFarePrices, getDriverQueue, 
getTerminalQueue, getNearbyTerminals, getTripEstimate, getDriverStats} from '../Controller/androidController.js';

import { verifyToken, requireType, } from '../middleware/authMiddleware.js'


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



export default router;