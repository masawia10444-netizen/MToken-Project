// ==========================================
// app.js (v5.0 Final Integration)
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

// ตั้งค่า Frontend
app.use('/test5', express.static(path.join(__dirname, 'public')));

const router = express.Router();

// API ตรวจสอบเวอร์ชัน (เผื่อไว้ยิงเช็ค)
router.get('/version', (req, res) => res.send('API v5.0 (Integration Ready)'));

router.post('/auth/login', async (req, res) => {
    // รับค่าและตัดช่องว่างหัวท้ายออก (กันเหนียว)
    let { appId, mToken } = req.body;
    if(appId) appId = appId.toString().trim();
    if(mToken) mToken = mToken.toString().trim();
    
    // Debug Object ที่จะส่งกลับไปหน้าบ้าน
    let debugInfo = {
        version: "5.0",
        received_params: { appId, mToken_length: mToken ? mToken.length : 0 }, // เช็คว่ารับค่ามาจริงไหม
        step1_gdx_token: null,
        step2_deproc_data: null,
        step3_db_saved: false
    };

    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken', debug: debugInfo });
    }

    try {
        // --- Step 1: GDX Authentication ---
        console.log('[v5.0] Step 1: Requesting GDX...');
        
        const gdxResponse = await axios.get(process.env.GDX_AUTH_URL, {
            params: {
                ConsumerSecret: process.env.CONSUMER_SECRET,
                AgentID: process.env.AGENT_ID
            },
            headers: {
                'Consumer-Key': process.env.CONSUMER_KEY,
                'Content-Type': 'application/json'
            }
        });

        debugInfo.step1_gdx_token = gdxResponse.data.Result;
        
        if (!debugInfo.step1_gdx_token) throw new Error('GDX Token is NULL');
        console.log('✅ GDX Token OK');

        // --- Step 2: Deproc (Personal Data) ---
        console.log('[v5.0] Step 2: Requesting Deproc...');
        
        const deprocResponse = await axios.post(
            process.env.DEPROC_API_URL,
            { AppId: appId, MToken: mToken }, // PascalCase ตามสเปก
            {
                headers: {
                    'Consumer-Key': process.env.CONSUMER_KEY,
                    'Content-Type': 'application/json',
                    'Token': debugInfo.step1_gdx_token
                }
            }
        );

        debugInfo.step2_deproc_data = deprocResponse.data;

        const personalData = deprocResponse.data.result; // r เล็ก
        if (!personalData) throw new Error("Deproc result is NULL");
        console.log('✅ Deproc Data OK');

        // --- Step 3: Database Save ---
        console.log('[v5.0] Step 3: Saving to DB...');
        
        const insertQuery = `
            INSERT INTO personal_data 
            (user_id, citizen_id, first_name, last_name, date_of_birth, mobile, email, notification)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (citizen_id) DO UPDATE SET 
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            mobile = EXCLUDED.mobile,
            email = EXCLUDED.email;
        `;

        await pool.query(insertQuery, [
            personalData.userId,
            personalData.citizenId,
            personalData.firstName,
            personalData.lastName,
            personalData.dateOfBirthString,
            personalData.mobile,
            personalData.email,
            personalData.notification
        ]);
        
        debugInfo.step3_db_saved = true;

        res.json({
            status: 'success',
            message: 'Login successful',
            debug: debugInfo,
            data: personalData
        });

    } catch (error) {
        console.error('[v5.0] Error:', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            debug: debugInfo,
            api_response: error.response?.data
        });
    }
});

app.use('/test5', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server v5.0 running on port ${PORT}`);
});