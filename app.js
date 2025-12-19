// ==========================================
// app.js (v16.0 Final Complete Version)
// Features: Login + Auto-Schema Fix + Register + Notification
// ==========================================
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Serve Frontend (Static Files)
app.use('/test5', express.static(path.join(__dirname, 'public')));

// --- Helper Function: ขอ GDX Token ---
async function getGdxToken() {
    try {
        const res = await axios.get(process.env.GDX_AUTH_URL, {
            params: { 
                ConsumerSecret: process.env.CONSUMER_SECRET, 
                AgentID: process.env.AGENT_ID 
            },
            headers: { 
                'Consumer-Key': process.env.CONSUMER_KEY, 
                'Content-Type': 'application/json' 
            }
        });
        return res.data.Result;
    } catch (e) {
        console.error("❌ Failed to get GDX Token:", e.message);
        throw new Error("Cannot get GDX Token");
    }
}

const router = express.Router();

// ------------------------------------------------------------------
// 1️⃣ API LOGIN (Login + Check DB + Auto Fix Schema)
// ------------------------------------------------------------------
router.post('/auth/login', async (req, res) => {
    const { appId, mToken } = req.body;
    
    // Validation
    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing AppId or mToken' });
    }

    try {
        // Step 1: Get Token
        const token = await getGdxToken();

        // Step 2: Get Profile from Government API (Deproc)
        const deprocRes = await axios.post(process.env.DEPROC_API_URL, 
            { AppId: appId, MToken: mToken },
            { 
                headers: { 
                    'Consumer-Key': process.env.CONSUMER_KEY, 
                    'Token': token, 
                    'Content-Type': 'application/json' 
                } 
            }
        );
        
        const pData = deprocRes.data.result;
        if (!pData) throw new Error("Deproc returned NULL (Token Expired or Invalid)");

        // ------------------------------------------------------------
        // 🔥 DB Maintenance: Auto-Fix Schema (สร้างตาราง + เพิ่มคอลัมน์เอง)
        // ------------------------------------------------------------
        try {
            // 1. สร้างตารางหลักถ้ายังไม่มี
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
            // 2. บังคับเพิ่มคอลัมน์ additional_info (แก้ปัญหา Column not exist)
            await pool.query(`ALTER TABLE personal_data ADD COLUMN IF NOT EXISTS additional_info TEXT;`);
        } catch (ignored) { 
            // ปล่อยผ่านถ้ามีปัญหาเล็กน้อย (เช่น คอลัมน์มีอยู่แล้ว)
        }

        // Step 3: Upsert Data (บันทึกหรืออัปเดตข้อมูลหลัก)
        await pool.query(`
            INSERT INTO personal_data (user_id, citizen_id, first_name, last_name, date_of_birth, mobile, email, notification)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (citizen_id) DO UPDATE SET 
            first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name;
        `, [pData.userId, pData.citizenId, pData.firstName, pData.lastName, pData.dateOfBirthString, pData.mobile, pData.email, pData.notification]);

        // Step 4: ดึงข้อมูลล่าสุดกลับไปแสดง (รวมถึงข้อมูลที่ User เคยกรอกเพิ่มไว้)
        const userDb = await pool.query('SELECT * FROM personal_data WHERE citizen_id = $1', [pData.citizenId]);
        const userData = userDb.rows[0];

        res.json({
            status: 'success',
            message: 'Login successful',
            data: { 
                // ข้อมูลจากรัฐ (Locked Fields)
                firstName: userData.first_name, 
                lastName: userData.last_name,
                citizenId: userData.citizen_id,
                userId: userData.user_id,
                // ข้อมูลที่แก้ไขได้ (Editable Fields)
                mobile: userData.mobile,
                additionalInfo: userData.additional_info || ""
            }
        });

    } catch (error) {
        console.error('❌ Login Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ------------------------------------------------------------------
// 2️⃣ API REGISTER / UPDATE (บันทึกข้อมูลเพิ่มเติมลง DB)
// ------------------------------------------------------------------
router.post('/user/register', async (req, res) => {
    const { citizenId, mobile, additionalInfo } = req.body;
    
    if (!citizenId) return res.status(400).json({ error: "Missing Citizen ID" });

    try {
        await pool.query(`
            UPDATE personal_data 
            SET additional_info = $1, mobile = $2
            WHERE citizen_id = $3
        `, [additionalInfo, mobile, citizenId]);

        res.json({ status: 'success', message: 'Update Complete' });
    } catch (e) {
        console.error('❌ Register Error:', e.message);
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// ------------------------------------------------------------------
// 3️⃣ API NOTIFICATION (ส่งแจ้งเตือนเข้าแอปทางรัฐ)
// ------------------------------------------------------------------
router.post('/notify/send', async (req, res) => {
    const { appId, userId, message } = req.body;
    
    if (!appId || !userId) return res.status(400).json({ error: "Missing appId or userId" });

    try {
        const token = await getGdxToken();
        
        // Format Body ตาม Spec ของ DGA (test3)
        const body = { 
            appId: appId, 
            data: [
                { 
                    message: message || "Test Notification", 
                    userId: userId 
                }
            ], 
            sendDateTime: null 
        };

        const notifyRes = await axios.post(process.env.NOTIFICATION_API_URL, body, { 
            headers: { 
                'Consumer-Key': process.env.CONSUMER_KEY, 
                'Token': token, 
                'Content-Type': 'application/json' 
            } 
        });

        res.json({ success: true, result: notifyRes.data });
    } catch (e) {
        console.error('❌ Notify Error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Mount Router & Start Server
app.use('/test5', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ v16.0 Final Complete Version Loaded`);
});