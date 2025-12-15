CREATE TABLE IF NOT EXISTS personal_data (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    citizen_id VARCHAR(13) UNIQUE NOT NULL, -- เลขบัตรประชาชน
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth VARCHAR(20),
    mobile VARCHAR(20),
    email VARCHAR(100),
    notification BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);