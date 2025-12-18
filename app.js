// app.js - Full Version
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// สร้าง Router สำหรับ Group path /test5
const router = express.Router();

// ---------------------------------------------------------
// Route 1: สำหรับเช็คสถานะ Server (GET)
// เอาไว้แก้ปัญหา "Cannot GET /test5/" เวลาเข้าผ่าน Browser
// ---------------------------------------------------------
router.get('/', (req, res) => {
    res.send('✅ mToken API Service is Running! (Ready to accept POST requests at /auth/login)');
});

// ---------------------------------------------------------
// Route 2: Flow หลัก - Login และเก็บข้อมูล (POST)
// Path จริงจะเป็น: /test5/auth/login
// ---------------------------------------------------------
router.post('/auth/login', async (req, res) => {
    // 1. รับค่าจาก Frontend
    const { appId, mToken } = req.body;

    // Validation เบื้องต้น
    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken' });
    }

    try {
        // --- Step 1: เรียก GDX Authentication (GET) ---
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

        const accessToken = gdxResponse.data.Result; // รับ Token
        console.log('Access Token Received');

        // --- Step 2: เรียก Deproc เพื่อดึงข้อมูลส่วนบุคคล (POST) ---
        console.log('Step 2: Requesting Personal Data (Deproc)...');

        const deprocResponse = await axios.post(
            process.env.DEPROC_API_URL,
            {
                // **สำคัญ** Body ต้องเป็น PascalCase ตาม Spec DGA
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

        const personalData = deprocResponse.data.result;
        
        if (!personalData) {
             throw new Error("No data returned from Deproc API");
        }

        // --- Step 3: บันทึกลง Database (PostgreSQL) ---
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

        // --- Step 4: ส่ง Response กลับ Frontend ---
        res.json({
            status: 'success',
            message: 'Login successful and data saved.',
            data: {
                firstName: personalData.firstName,
                lastName: personalData.lastName
            }
        });

    } catch (error) {
        // Log Error อย่างละเอียดเพื่อการ Debug
        console.error('Error Step:', error.response?.config?.url || 'Internal Processing');
        console.error('Error Message:', error.message);
        console.error('Error Response:', error.response?.data);

        res.status(500).json({ 
            status: 'error', 
            message: 'Process failed',
            detail: error.response?.data || error.message 
        });
    }
});

// Mount Router ไปที่ path /test5
app.use('/test5', router);

// เริ่มต้น Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on internal port ${PORT}`);
});