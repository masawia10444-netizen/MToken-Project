const express = require('express');
const axios = require('axios');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Router สำหรับ path /test5
const router = express.Router();

router.post('/auth/login', async (req, res) => {
    // รับค่าจากหน้าบ้าน (Frontend อาจส่งมาเป็นตัวเล็ก)
    const { appId, mToken } = req.body;

    if (!appId || !mToken) {
        return res.status(400).json({ error: 'Missing appId or mToken' });
    }

    try {
        // ---------------------------------------------------------
        // Step 1: เรียก GDX Authentication (GET)
        // อ้างอิงรูป: image_2586ff.png
        // ---------------------------------------------------------
        console.log('Step 1: Requesting GDX Access Token...');
        
        const gdxResponse = await axios.get(process.env.GDX_AUTH_URL, {
            params: {
                ConsumerSecret: process.env.CONSUMER_SECRET, // ตามรูป
                AgentID: process.env.AGENT_ID               // ตามรูป (ตัว D ใหญ่)
            },
            headers: {
                'Consumer-Key': process.env.CONSUMER_KEY,   // ตามรูป (มีขีดกลาง)
                'Content-Type': 'application/json'
            }
        });

        const accessToken = gdxResponse.data.Result; // ตามรูป image_2586ff Response คือ "Result"
        console.log('Access Token Received:', accessToken ? 'Yes' : 'No');

        // ---------------------------------------------------------
        // Step 2: เรียก Deproc เพื่อเอาข้อมูลส่วนตัว (POST)
        // อ้างอิงรูป: image_25837b.png
        // ---------------------------------------------------------
        console.log('Step 2: Requesting Personal Data (Deproc)...');

        const deprocResponse = await axios.post(
            process.env.DEPROC_API_URL,
            {
                // *** สำคัญ: Body ต้องเป็น PascalCase ตามรูป ***
                AppId: appId,   
                MToken: mToken  
            },
            {
                headers: {
                    'Consumer-Key': process.env.CONSUMER_KEY,
                    'Content-Type': 'application/json',
                    'Token': accessToken // ตามรูป Header ชื่อ "Token"
                }
            }
        );

        // ดึงข้อมูลจาก result (ตามรูป image_25837b)
        const personalData = deprocResponse.data.result; 

        if (!personalData) {
             throw new Error("No data returned from Deproc API");
        }

        // ---------------------------------------------------------
        // Step 3: บันทึกลง Database (PostgreSQL)
        // ---------------------------------------------------------
        console.log('Step 3: Saving to Database...');
        
        // แปลง citizenId เป็น user_id หรือตาม logic ที่ต้องการ
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
            personalData.userId,           // จาก API
            personalData.citizenId,        // จาก API
            personalData.firstName,        // จาก API
            personalData.lastName,         // จาก API
            personalData.dateOfBirthString,// จาก API
            personalData.mobile,           // จาก API
            personalData.email,            // จาก API
            personalData.notification      // จาก API
        ]);

        // ---------------------------------------------------------
        // Step 4: ส่ง Response กลับ Frontend
        // ---------------------------------------------------------
        res.json({
            status: 'success',
            message: 'Login successful',
            data: {
                firstName: personalData.firstName,
                lastName: personalData.lastName
            }
        });

    } catch (error) {
        console.error('Error Step:', error.response?.config?.url || 'Internal Code');
        console.error('Error Details:', error.response?.data || error.message);
        
        res.status(500).json({ 
            status: 'error', 
            message: 'Process failed',
            detail: error.response?.data || error.message 
        });
    }
});

app.use('/test5', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on internal port ${PORT}`);
});