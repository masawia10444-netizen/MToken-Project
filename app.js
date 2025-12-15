// app.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ตั้งค่า Router ให้รองรับ Path /test5 ตามโจทย์
const router = express.Router();

// Route รับค่า AppId และ MToken จาก Frontend
router.post('/auth/login', async (req, res) => {
    // 1. รับค่าจาก Frontend (Landing Page)
    const { appId, mToken } = req.body; // รับเป็น camelCase จากหน้าบ้าน

    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken' });
    }

    try {
        // --- [Step 1] เรียก API Authentication (GET) ---
        // อ้างอิงภาพ: image_2586ff.png
        console.log('Step 1: Requesting GDX Access Token...');
        
        const gdxUrl = process.env.GDX_AUTH_URL;
        
        const gdxResponse = await axios.get(gdxUrl, {
            params: {
                ConsumerSecret: process.env.CONSUMER_SECRET,
                AgentID: process.env.AGENT_ID
            },
            headers: {
                'Consumer-Key': process.env.CONSUMER_KEY,
                'Content-Type': 'application/json'
            }
        });

        const accessToken = gdxResponse.data.Result; // ได้ Token กลับมา
        console.log('Access Token Received');

        // --- [Step 2] เรียก API Deproc (POST) ---
        // อ้างอิงภาพ: image_25837b.png และ image_258662.png
        console.log('Step 2: Requesting Personal Data (Deproc)...');

        const deprocResponse = await axios.post(
            process.env.DEPROC_API_URL,
            {
                // **สำคัญ** Body ต้องเป็น PascalCase ตาม Spec ในรูป
                AppId: appId,
                MToken: mToken
            },
            {
                headers: {
                    'Consumer-Key': process.env.CONSUMER_KEY,
                    'Content-Type': 'application/json',
                    'Token': accessToken // Header ชื่อ "Token"
                }
            }
        );

        // ดึงข้อมูลส่วนบุคคลจาก Response (อยู่ใน object "result")
        const personalData = deprocResponse.data.result;
        
        if (!personalData) {
             throw new Error("No data returned from Deproc API");
        }

        // --- [Step 3] เก็บข้อมูลลง PostgreSQL ---
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

        // --- [Step 4] Response กลับไป Frontend ---
        res.json({
            status: 'success',
            message: 'Data retrieved and saved successfully',
            data: {
                firstName: personalData.firstName,
                lastName: personalData.lastName
            }
        });

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to process mToken login',
            detail: error.response?.data || error.message 
        });
    }
});

// Mount router ไปที่ /test5
app.use('/test5', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on internal port ${PORT}, mounted at /test5`);
});