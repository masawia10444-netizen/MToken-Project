// ==========================================
// app.js (v12.0 Full Option - Login + Notify)
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

// --- Helper Function: ขอ GDX Token (ใช้ซ้ำได้) ---
async function getGdxToken() {
    const res = await axios.get(process.env.GDX_AUTH_URL, {
        params: { ConsumerSecret: process.env.CONSUMER_SECRET, AgentID: process.env.AGENT_ID },
        headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Content-Type': 'application/json' }
    });
    return res.data.Result;
}

const router = express.Router();

// 1️⃣ API Login (เหมือนเดิม แต่ Clean ขึ้น)
router.post('/auth/login', async (req, res) => {
    const { appId, mToken } = req.body;
    let debugInfo = { step1: null, step2: null, step3: false };

    if (!appId || !mToken) return res.status(400).json({ error: 'Missing Data' });

    try {
        console.log('🔹 Login Step 1: Getting Token...');
        const token = await getGdxToken();
        debugInfo.step1 = token;

        console.log('🔹 Login Step 2: Getting Profile...');
        const deprocRes = await axios.post(process.env.DEPROC_API_URL, 
            { AppId: appId, MToken: mToken },
            { headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': token, 'Content-Type': 'application/json' } }
        );
        debugInfo.step2 = deprocRes.data;
        
        const pData = deprocRes.data.result;
        if (!pData) throw new Error("mToken Expired or Invalid");

        console.log('🔹 Login Step 3: Saving DB...');
        // Auto-Create Table
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

        await pool.query(`
            INSERT INTO personal_data (user_id, citizen_id, first_name, last_name, date_of_birth, mobile, email, notification)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (citizen_id) DO UPDATE SET 
            first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, mobile = EXCLUDED.mobile;
        `, [pData.userId, pData.citizenId, pData.firstName, pData.lastName, pData.dateOfBirthString, pData.mobile, pData.email, pData.notification]);
        
        debugInfo.step3 = true;

        res.json({
            status: 'success',
            message: 'Login successful',
            debug: debugInfo,
            data: { 
                firstName: pData.firstName, 
                lastName: pData.lastName,
                citizenId: pData.citizenId // ส่งกลับไปเพื่อใช้ยิง Notify ต่อ
            }
        });

    } catch (error) {
        console.error('❌ Login Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message, debug: debugInfo });
    }
});

// 2️⃣ API Notification (ของใหม่!)
router.post('/notify/send', async (req, res) => {
    const { citizenId, message } = req.body;
    
    if (!citizenId) return res.status(400).json({ error: 'Missing Citizen ID' });

    try {
        console.log(`🔹 Sending Notification to: ${citizenId}`);
        const token = await getGdxToken(); // ขอ Token ใหม่สดๆ

        // Payload สำหรับ Notification (ปรับตาม Spec ของทางรัฐ)
        // ปกติต้องส่ง CitizenID และ ข้อความ
        const notifyBody = {
            CitizenId: citizenId,
            Messages: [{
                TemplateId: 1, // หรือใส่ ID ตามที่ตกลงกับทางรัฐ
                Topic: "แจ้งเตือนทดสอบ",
                Detail: message || "ทดสอบระบบ mToken สำเร็จ!"
            }]
        };

        const notifyRes = await axios.post(process.env.NOTIFICATION_API_URL, 
            notifyBody,
            { headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': token, 'Content-Type': 'application/json' } }
        );

        console.log('✅ Notify Result:', notifyRes.data);
        res.json({ status: 'success', data: notifyRes.data });

    } catch (error) {
        console.error('❌ Notify Error:', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            detail: error.response?.data 
        });
    }
});

app.use('/test5', router);
app.listen(process.env.PORT || 3000, () => console.log(`🚀 v12.0 Full Option Running...`));