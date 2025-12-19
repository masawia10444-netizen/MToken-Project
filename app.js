// ==========================================
// app.js (v11.0 Auto-Table Creation)
// แก้ปัญหา relation "personal_data" does not exist
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

app.use('/test5', express.static(path.join(__dirname, 'public')));

const router = express.Router();

router.post('/auth/login', async (req, res) => {
    const { appId, mToken } = req.body;
    
    let debugInfo = {
        step1_gdx_token: null,
        step2_deproc_data: null,
        step3_db_saved: false
    };

    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken' });
    }

    try {
        // --- Step 1: GDX ---
        console.log('🔹 Step 1: Requesting GDX...');
        const gdxRes = await axios.get(process.env.GDX_AUTH_URL, {
            params: { ConsumerSecret: process.env.CONSUMER_SECRET, AgentID: process.env.AGENT_ID },
            headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Content-Type': 'application/json' }
        });
        debugInfo.step1_gdx_token = gdxRes.data.Result;
        if (!debugInfo.step1_gdx_token) throw new Error('GDX returned empty token');

        // --- Step 2: Deproc ---
        console.log('🔹 Step 2: Requesting Deproc...');
        const deprocRes = await axios.post(process.env.DEPROC_API_URL, 
            { AppId: appId, MToken: mToken },
            { headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': debugInfo.step1_gdx_token, 'Content-Type': 'application/json' } }
        );
        debugInfo.step2_deproc_data = deprocRes.data;
        const pData = deprocRes.data.result;
        
        if (!pData) throw new Error("Deproc returned no result (Check mToken expiry)");

        // --- Step 3: Save DB (พร้อมสร้างตารางอัตโนมัติ) ---
        console.log('🔹 Step 3: Saving to DB...');

        // 🔥 เพิ่ม: สร้างตารางถ้ายังไม่มี (แก้ปัญหา Table not exist)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS personal_data (
                user_id VARCHAR(255) PRIMARY KEY,
                citizen_id VARCHAR(255) UNIQUE,
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                date_of_birth VARCHAR(255),
                mobile VARCHAR(255),
                email VARCHAR(255),
                notification VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // บันทึกข้อมูล
        await pool.query(`
            INSERT INTO personal_data (user_id, citizen_id, first_name, last_name, date_of_birth, mobile, email, notification)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (citizen_id) DO UPDATE SET 
            first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, mobile = EXCLUDED.mobile;
        `, [pData.userId, pData.citizenId, pData.firstName, pData.lastName, pData.dateOfBirthString, pData.mobile, pData.email, pData.notification]);
        
        debugInfo.step3_db_saved = true;

        res.json({
            status: 'success',
            message: 'Login successful',
            debug: debugInfo,
            data: { firstName: pData.firstName, lastName: pData.lastName }
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            debug: debugInfo,
            api_response: error.response?.data
        });
    }
});

app.use('/test5', router);
app.listen(process.env.PORT || 3000, () => console.log(`🚀 v11.0 Auto-Table Running...`));