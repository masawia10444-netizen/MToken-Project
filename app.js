// app.js - Final Debug Version
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

// ตั้งค่า Frontend (ให้เปิดไฟล์ index.html จากโฟลเดอร์ public)
app.use('/test5', express.static(path.join(__dirname, 'public')));

const router = express.Router();

// --- API หลัก: Login & Debug ---
router.post('/auth/login', async (req, res) => {
    const { appId, mToken } = req.body;
    
    // ตัวแปรสำหรับเก็บข้อมูลเพื่อส่งกลับไป Debug หน้าบ้าน
    let debugInfo = {
        step1_gdx_token: null,
        step2_deproc_data: null,
        step3_db_saved: false
    };

    // 1. Validation
    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken' });
    }

    try {
        // ---------------------------------------------------------
        // Step 1: เรียก GDX Authentication (หา Token)
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

        // เก็บ Token ไว้ส่งกลับไปดูหน้าบ้าน
        debugInfo.step1_gdx_token = gdxResponse.data.Result;
        console.log('✅ Token Received:', debugInfo.step1_gdx_token ? 'Yes' : 'No');

        if (!debugInfo.step1_gdx_token) {
            throw new Error('GDX returned empty token');
        }

        // ---------------------------------------------------------
        // Step 2: เรียก Deproc (ดึงข้อมูลส่วนบุคคล)
        // ---------------------------------------------------------
        console.log('🔹 Step 2: Requesting Personal Data (Deproc)...');

        const deprocResponse = await axios.post(
            process.env.DEPROC_API_URL,
            {
                AppId: appId,   // PascalCase ตาม Spec
                MToken: mToken  // PascalCase ตาม Spec
            },
            {
                headers: {
                    'Consumer-Key': process.env.CONSUMER_KEY,
                    'Content-Type': 'application/json',
                    'Token': debugInfo.step1_gdx_token // ส่ง Token ที่ได้จาก Step 1
                }
            }
        );

        debugInfo.step2_deproc_data = deprocResponse.data; // เก็บ Response ดิบๆ ไว้ดู

        const personalData = deprocResponse.data.result;
        if (!personalData) {
             throw new Error("Deproc API executed but returned no 'result' object");
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
            debug: debugInfo, // <--- ส่งข้อมูล Debug กลับไปโชว์หน้าเว็บ
            data: {
                firstName: personalData.firstName,
                lastName: personalData.lastName
            }
        });

    } catch (error) {
        console.error('❌ Error Occurred:', error.message);
        
        // ส่ง Error กลับไป พร้อมข้อมูล Debug เท่าที่ทำได้
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            debug: debugInfo, // <--- ส่งข้อมูล Debug กลับไปโชว์หน้าเว็บ (จะได้รู้ว่าตายตรงไหน)
            api_response: error.response?.data || 'No response data'
        });
    }
});

app.use('/test5', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});