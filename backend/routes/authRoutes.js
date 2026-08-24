import express from 'express';
import { signup, login, getRoles, 
        GetAllTerminalLocations, 
        getFarePrices} from '../Controller/androidController.js';


const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/getRoles', getRoles);
router.get('/getTerminalsLocation', GetAllTerminalLocations);
router.get('/Fare', getFarePrices);


export default router;