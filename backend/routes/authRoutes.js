import express from 'express';
import 
{ signup, login, getRoles, 
GetAllTerminalLocations, 
getFarePrices,
getDriverInfo} from '../Controller/androidController.js';

import { verifyToken, requireType, } from '../middleware/authMiddleware.js'


const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/getRoles', getRoles);
router.get('/getTerminalsLocation', GetAllTerminalLocations);
router.get('/Fare', getFarePrices);
router.get ('/getDriverInfo', verifyToken, requireType("Driver"), getDriverInfo);


export default router;