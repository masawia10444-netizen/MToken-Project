// ==========================================
// app.js (v7.0 Mobile App Ready)
// ==========================================
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Frontend Path
app.use('/test5', express.static(path.join(__dirname, 'public')));

const router = express.Router();

// 1. API Login (ส่ง userId กลับไปให้ Frontend)
router.post('/auth/login', async (req, res) => {
    let { appId, mToken } = req.body;
    if(appId) appId = appId.toString().trim();
    if(mToken) mToken = mToken.toString().trim();

    if (!appId || !mToken) return res.status(400).json({ error: 'Missing Data' });

    try {
        // Step 1: GDX
        const gdxRes = await axios.get(process.env.GDX_AUTH_URL, {
            params: { ConsumerSecret: process.env.CONSUMER_SECRET, AgentID: process.env.AGENT_ID },
            headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Content-Type': 'application/json' }
        });
        const token = gdxRes.data.Result;

        // Step 2: Deproc
        const deprocRes = await axios.post(process.env.DEPROC_API_URL, 
            { AppId: appId, MToken: mToken },
            { headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': token, 'Content-Type': 'application/json' } }
        );
        const pData = deprocRes.data.result;

        // Step 3: DB
        await pool.query(`INSERT INTO personal_data (user_id, citizen_id, first_name, last_name, date_of_birth, mobile, email, notification)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (citizen_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, mobile = EXCLUDED.mobile;`, 
            [pData.userId, pData.citizenId, pData.firstName, pData.lastName, pData.dateOfBirthString, pData.mobile, pData.email, pData.notification]
        );

        // Success Response (ส่ง userId กลับไป)
        res.json({
            status: 'success',
            data: {
                userId: pData.userId, // <--- สำคัญมาก ต้องมีตัวนี้
                firstName: pData.firstName,
                lastName: pData.lastName
            }
        });

    } catch (e) {
        console.error(e.message);
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// 2. API Send Notification
router.post('/notification/push', async (req, res) => {
    const { appId, message, userIds } = req.body; 
    if (!appId || !message || !userIds) return res.status(400).json({ error: 'Missing Data' });

    try {
        const gdxRes = await axios.get(process.env.GDX_AUTH_URL, {
            params: { ConsumerSecret: process.env.CONSUMER_SECRET, AgentID: process.env.AGENT_ID },
            headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Content-Type': 'application/json' }
        });

        const payload = {
            appId: appId,
            data: userIds.map(uid => ({ message: message, userId: uid })),
            sendDateTime: new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
        };

        const notiRes = await axios.post(process.env.NOTIFICATION_API_URL, payload,
            { headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': gdxRes.data.Result, 'Content-Type': 'application/json' } }
        );

        res.json({ status: 'success', dga_response: notiRes.data });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.use('/test5', router);
app.listen(process.env.PORT || 3000, () => console.log(`🚀 v7.0 App Mode Running...`));