const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path'); // ใช้สำหรับจัดการ path ของไฟล์ Frontend
const pool = require('./db'); // เรียกใช้การเชื่อมต่อ Database จากไฟล์ db.js
require('dotenv').config();

const app = express();

// --- Middleware ---
app.use(express.json()); // รองรับ JSON Request Body
app.use(cors());         // อนุญาตให้เรียกข้าม Domain ได้

// --- 1. การตั้งค่า Frontend (Landing Page) ---
// บอกให้ Node.js รู้ว่าไฟล์ HTML/CSS อยู่ในโฟลเดอร์ชื่อ 'public'
// เมื่อเข้า https://.../test5/ ระบบจะไปดึงไฟล์ index.html ในโฟลเดอร์ public มาแสดง
app.use('/test5', express.static(path.join(__dirname, 'public')));

// --- 2. การตั้งค่า API (Backend Logic) ---
const router = express.Router();

// Route: สำหรับรับค่า Login และดึงข้อมูล (POST /test5/auth/login)
router.post('/auth/login', async (req, res) => {
    // 1. รับค่า appId และ mToken ที่ส่งมาจากหน้า Frontend
    const { appId, mToken } = req.body;

    // เช็คว่าส่งค่ามาครบไหม
    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken' });
    }

    try {
        // ---------------------------------------------------------
        // Step 1: เรียก GDX Authentication (เพื่อขอ Access Token)
        // ---------------------------------------------------------
        console.log('Step 1: Requesting GDX Access Token...');
        
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

        const accessToken = gdxResponse.data.Result; // ตัวแปร Result (R ตัวใหญ่ตามสเปก)
        
        if (!accessToken) {
            throw new Error('Failed to retrieve Access Token from GDX');
        }
        console.log('Access Token Received');

        // ---------------------------------------------------------
        // Step 2: เรียก Deproc (เพื่อดึงข้อมูลส่วนบุคคล)
        // ---------------------------------------------------------
        console.log('Step 2: Requesting Personal Data (Deproc)...');

        const deprocResponse = await axios.post(
            process.env.DEPROC_API_URL,
            {
                // **สำคัญ** Body ต้องเป็น PascalCase (ตัวแรกใหญ่) ตามสเปก DGA
                AppId: appId,
                MToken: mToken
            },
            {
                headers: {
                    'Consumer-Key': process.env.CONSUMER_KEY,
                    'Content-Type': 'application/json',
                    'Token': accessToken
                }
            }
        );

        // ดึงข้อมูลส่วนบุคคลจาก result (r เล็ก ตาม Response ของ Deproc)
        const personalData = deprocResponse.data.result; 
        
        if (!personalData) {
             throw new Error("No data returned from Deproc API");
        }

        // ---------------------------------------------------------
        // Step 3: บันทึกข้อมูลลง Database (PostgreSQL)
        // ---------------------------------------------------------
        console.log('Step 3: Saving to Database...');
        
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

        // ---------------------------------------------------------
        // Step 4: ส่งผลลัพธ์กลับไปบอกหน้า Frontend
        // ---------------------------------------------------------
        res.json({
            status: 'success',
            message: 'Login successful and data saved.',
            data: {
                firstName: personalData.firstName,
                lastName: personalData.lastName
            }
        });

    } catch (error) {
        // Log Error อย่างละเอียดเพื่อให้เรากลับมาแก้บั๊กได้ง่าย
        console.error('--- Login Error ---');
        console.error('URL:', error.response?.config?.url || 'Internal Process');
        console.error('Message:', error.message);
        console.error('Response Data:', error.response?.data);

        res.status(500).json({ 
            status: 'error', 
            message: 'Process failed',
            detail: error.response?.data || error.message 
        });
    }
});

// เชื่อม Router เข้ากับ path /test5
app.use('/test5', router);

// --- เริ่มต้น Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on internal port ${PORT}`);
    console.log(`   - Frontend served at /test5/`);
    console.log(`   - API endpoint at /test5/auth/login`);
});