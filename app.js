// ==========================================
// app.js (v17.0 No Auto-Save Logic)
// Login = Check Only / Register = Insert
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

// Serve Frontend
app.use('/test5', express.static(path.join(__dirname, 'public')));

// --- Helper: ขอ GDX Token ---
async function getGdxToken() {
    try {
        const res = await axios.get(process.env.GDX_AUTH_URL, {
            params: { ConsumerSecret: process.env.CONSUMER_SECRET, AgentID: process.env.AGENT_ID },
            headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Content-Type': 'application/json' }
        });
        return res.data.Result;
    } catch (e) {
        console.error("❌ Failed to get GDX Token:", e.message);
        throw new Error("Cannot get GDX Token");
    }
}

const router = express.Router();

// ------------------------------------------------------------------
// 1️⃣ API LOGIN (เช็คอย่างเดียว ห้ามบันทึก)
// ------------------------------------------------------------------
router.post('/auth/login', async (req, res) => {
    const { appId, mToken } = req.body;
    if (!appId || !mToken) return res.status(400).json({ error: 'Missing Data' });

    try {
        // Step 1: Get Token
        const token = await getGdxToken();

        // Step 2: Get Profile from Govt
        const deprocRes = await axios.post(process.env.DEPROC_API_URL, 
            { AppId: appId, MToken: mToken },
            { headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': token, 'Content-Type': 'application/json' } }
        );
        
        const pData = deprocRes.data.result;
        if (!pData) throw new Error("Deproc returned NULL (Token Expired)");

        // ------------------------------------------------------------
        // 🔥 จุดเปลี่ยน: เช็ค DB ก่อน (ยังไม่บันทึก)
        // ------------------------------------------------------------
        
        // Auto-Fix Schema (เผื่อยังไม่มีตาราง)
        try {
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
                    additional_info TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (ignored) {}

        // เช็คว่ามีคนนี้ในระบบไหม?
        const userDb = await pool.query('SELECT * FROM personal_data WHERE citizen_id = $1', [pData.citizenId]);
        
        if (userDb.rows.length > 0) {
            // ✅ กรณีมีข้อมูลแล้ว (Login สำเร็จเลย)
            const userData = userDb.rows[0];
            return res.json({
                status: 'found', // บอก Frontend ว่าเจอแล้ว
                message: 'User exists, login complete',
                data: { 
                    userId: userData.user_id,
                    citizenId: userData.citizen_id,
                    firstName: userData.first_name, 
                    lastName: userData.last_name,
                    mobile: userData.mobile,
                    additionalInfo: userData.additional_info || ""
                }
            });
        } else {
            // 🆕 กรณีสมาชิกใหม่ (ส่งข้อมูลรัฐกลับไปให้กรอกต่อหน้า Register)
            return res.json({
                status: 'new_user', // บอก Frontend ให้เด้งไปหน้า Register
                message: 'User not found, please register',
                data: { 
                    // ส่งข้อมูลที่ได้จากรัฐกลับไป (ยังไม่ได้บันทึกลง DB)
                    userId: pData.userId,
                    citizenId: pData.citizenId,
                    firstName: pData.firstName,
                    lastName: pData.lastName,
                    dateOfBirthString: pData.dateOfBirthString,
                    email: pData.email,
                    notification: pData.notification,
                    mobile: pData.mobile // เบอร์เดิมจากรัฐ (ถ้ามี)
                }
            });
        }

    } catch (error) {
        console.error('❌ Login Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ------------------------------------------------------------------
// 2️⃣ API REGISTER (บันทึกครั้งแรก - INSERT)
// ------------------------------------------------------------------
router.post('/user/register', async (req, res) => {
    // ต้องรับข้อมูลทั้งหมด เพราะใน DB ยังไม่มีอะไรเลย
    const { 
        userId, citizenId, firstName, lastName, dateOfBirth, 
        email, notification, mobile, additionalInfo 
    } = req.body;
    
    if (!citizenId || !userId) return res.status(400).json({ error: "Missing Data" });

    try {
        // ทำการ INSERT ข้อมูลใหม่
        await pool.query(`
            INSERT INTO personal_data 
            (user_id, citizen_id, first_name, last_name, date_of_birth, email, notification, mobile, additional_info)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (citizen_id) DO UPDATE SET 
            mobile = EXCLUDED.mobile, additional_info = EXCLUDED.additional_info;
        `, [userId, citizenId, firstName, lastName, dateOfBirth, email, notification, mobile, additionalInfo]);

        res.json({ status: 'success', message: 'Registration Complete' });
    } catch (e) {
        console.error('❌ Register Error:', e.message);
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// 3️⃣ API Notify (เหมือนเดิม)
router.post('/notify/send', async (req, res) => {
    const { appId, userId, message } = req.body;
    try {
        const token = await getGdxToken();
        const body = { appId, data: [{ message: message || "Test", userId }], sendDateTime: null };
        const notifyRes = await axios.post(process.env.NOTIFICATION_API_URL, body, { 
            headers: { 'Consumer-Key': process.env.CONSUMER_KEY, 'Token': token, 'Content-Type': 'application/json' } 
        });
        res.json({ success: true, result: notifyRes.data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.use('/test5', router);
app.listen(process.env.PORT || 3000, () => console.log(`🚀 v17.0 No Auto-Save Running...`));