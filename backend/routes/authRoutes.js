import express from 'express';
import 
{ signup, login, getRoles, 
GetAllTerminalLocations, getFarePrices, getDriverInfo, getDriverQueue, 
getTerminalQueue} from '../Controller/androidController.js';

import { verifyToken, requireType, } from '../middleware/authMiddleware.js'


const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/getRoles', getRoles);
router.get('/terminalQueue', verifyToken, getTerminalQueue);
router.get('/getTerminalsLocation', verifyToken, requireType('driver', 'user'), GetAllTerminalLocations);
router.get('/Fare', verifyToken, requireType('driver', 'user'), getFarePrices);
router.get ('/getDriverInfo', verifyToken, requireType('driver'), getDriverInfo);
router.get('/driverQueue', verifyToken, requireType, getDriverQueue);



export default router;