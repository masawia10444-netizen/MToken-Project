// ==========================================
// app.js (v10.0 Lite - Basic Auth Only)
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

// --- API Login (เน้นชัวร์ ไม่เน้นลูกเล่น) ---
router.post('/auth/login', async (req, res) => {
    let { appId, mToken } = req.body;
    
    // 1. Validation เบื้องต้น
    if(!appId || !mToken) return res.status(400).json({ error: 'Missing Data' });
    
    appId = appId.toString().trim();
    mToken = mToken.toString().trim();

    try {
        console.log('🔹 Step 1: Getting GDX Token...');
        const gdxRes = await axios.get(process.env.GDX_AUTH_URL, {
            params: { ConsumerSecret: process.env.CONSUMER_SECRET, AgentID: process.env.AGENT_ID },
            headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Content-Type': 'application/json' }
        });
        
        const token = gdxRes.data.Result;
        if(!token) throw new Error("GDX Token not received (Check .env GDX_AUTH_URL)");

        console.log('🔹 Step 2: Getting Personal Data...');
        const deprocRes = await axios.post(process.env.DEPROC_API_URL, 
            { AppId: appId, MToken: mToken },
            { headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': token, 'Content-Type': 'application/json' } }
        );
        
        // 🔥 จุดที่เคย Error: เช็คก่อนว่ามีข้อมูลไหม ถ้าไม่มีให้ฟ้อง Error เลย
        const pData = deprocRes.data.result;
        if(!pData) {
            console.error('Deproc Response:', deprocRes.data);
            throw new Error("API รัฐไม่ส่งข้อมูลกลับมา (Token อาจหมดอายุ หรือ URL ผิด)");
        }

        console.log('🔹 Step 3: Saving to DB...');
        await pool.query(`INSERT INTO personal_data (user_id, citizen_id, first_name, last_name, date_of_birth, mobile, email, notification)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (citizen_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, mobile = EXCLUDED.mobile;`, 
            [pData.userId, pData.citizenId, pData.firstName, pData.lastName, pData.dateOfBirthString, pData.mobile, pData.email, pData.notification]
        );

        // Success: ส่งแค่ชื่อกลับไปโชว์
        res.json({
            status: 'success',
            data: {
                firstName: pData.firstName,
                lastName: pData.lastName
            }
        });

    } catch (e) {
        console.error('❌ Login Error:', e.message);
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.use('/test5', router);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 v10.0 Lite Running on port ${PORT}`));