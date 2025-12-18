// ==========================================
// app.js (Full Debug Version)
// ==========================================
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const pool = require('./db'); // ต้องมีไฟล์ db.js อยู่ที่เดียวกัน
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ตั้งค่า Frontend: ให้เปิดไฟล์ index.html จากโฟลเดอร์ public
// เมื่อเข้า https://.../test5/ ระบบจะวิ่งไปหา index.html
app.use('/test5', express.static(path.join(__dirname, 'public')));

const router = express.Router();

// --- API หลัก: Login & Debug ---
router.post('/auth/login', async (req, res) => {
    const { appId, mToken } = req.body;
    
    // สร้างตัวแปรเก็บ Log ไว้ส่งกลับไปหน้าเว็บ
    let debugInfo = {
        step1_gdx_token: null,     // จะเก็บ Token ที่ได้จาก GDX
        step2_deproc_data: null,   // จะเก็บข้อมูลดิบจาก Deproc
        step3_db_saved: false      // จะบอกว่าลง DB สำเร็จไหม
    };

    // 1. ตรวจสอบค่าที่ส่งมา
    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken' });
    }

    try {
        // ---------------------------------------------------------
        // Step 1: เรียก GDX Authentication (เพื่อขอ Access Token)
        // ---------------------------------------------------------
        console.log('🔹 Step 1: Requesting GDX Access Token...');
        
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

        // เก็บ Token ไว้ใน debugInfo
        debugInfo.step1_gdx_token = gdxResponse.data.Result;
        console.log('✅ Token Received:', debugInfo.step1_gdx_token ? 'Yes' : 'No');

        if (!debugInfo.step1_gdx_token) {
            throw new Error('GDX returned empty token (Result is null)');
        }

        // ---------------------------------------------------------
        // Step 2: เรียก Deproc (เพื่อดึงข้อมูลส่วนบุคคล)
        // ---------------------------------------------------------
        console.log('🔹 Step 2: Requesting Personal Data (Deproc)...');

        const deprocResponse = await axios.post(
            process.env.DEPROC_API_URL,
            {
                AppId: appId,   // ส่งตัวใหญ่ PascalCase ตามสเปก
                MToken: mToken  // ส่งตัวใหญ่ PascalCase ตามสเปก
            },
            {
                headers: {
                    'Consumer-Key': process.env.CONSUMER_KEY,
                    'Content-Type': 'application/json',
                    'Token': debugInfo.step1_gdx_token // เอา Token จาก Step 1 มาใส่
                }
            }
        );

        // เก็บข้อมูลดิบไว้ดู (เผื่อ field ชื่อไม่ตรง)
        debugInfo.step2_deproc_data = deprocResponse.data;

        const personalData = deprocResponse.data.result;
        if (!personalData) {
             throw new Error("Deproc executed but returned no 'result' object");
        }

        // ---------------------------------------------------------
        // Step 3: บันทึกลง Database
        // ---------------------------------------------------------
        console.log('🔹 Step 3: Saving to Database...');
        
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

        // ---------------------------------------------------------
        // Step 4: ส่งผลลัพธ์กลับ (Success)
        // ---------------------------------------------------------
        res.json({
            status: 'success',
            message: 'Login successful',
            debug: debugInfo, // <--- ส่งข้อมูล Debug ทั้งหมดกลับไปโชว์
            data: {
                firstName: personalData.firstName,
                lastName: personalData.lastName
            }
        });

    } catch (error) {
        console.error('❌ Error Occurred:', error.message);
        
        // ส่ง Error กลับไป พร้อมข้อมูล Debug เท่าที่มี (จะได้รู้ว่าตายตรงไหน)
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            debug: debugInfo, 
            api_response: error.response?.data || 'No response data from API'
        });
    }
});

// เชื่อม Router
app.use('/test5', router);

// เริ่ม Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});