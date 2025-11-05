-- Amam Ride-Sharing Platform Database Schema

-- Drop existing tables if they exist
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS rides CASCADE;
DROP TABLE IF EXISTS driver_applications CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table (all students, with optional driver status)
-- Linked to Supabase Auth via id (UUID matching auth.users.id)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    student_id VARCHAR(50) NOT NULL UNIQUE,
    university VARCHAR(255) NOT NULL,
    major VARCHAR(100),
    phone VARCHAR(20),
    -- Make enum for account type (student, faculty member, admin)
    account_type VARCHAR(20) DEFAULT 'student',
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Driver applications (students applying to be drivers)
CREATE TABLE driver_applications (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(50) NOT NULL,
    vehicle_make VARCHAR(50) NOT NULL,
    vehicle_model VARCHAR(50) NOT NULL,
    vehicle_year INTEGER,
    vehicle_color VARCHAR(30),
    plate_number VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by UUID REFERENCES users(id),
    rejection_reason TEXT,
    
    -- Driver stats (after approval)
    is_active_driver BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    total_rides INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 5.00,
    total_earnings DECIMAL(10,2) DEFAULT 0.00,
    
    UNIQUE(user_id)
);

-- Rides table
CREATE TABLE rides (
    id SERIAL PRIMARY KEY,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    pickup_location VARCHAR(255) NOT NULL,
    pickup_lat DECIMAL(10,8),
    pickup_lng DECIMAL(11,8),
    destination_location VARCHAR(255) NOT NULL,
    destination_lat DECIMAL(10,8),
    destination_lng DECIMAL(11,8),
    passengers INTEGER DEFAULT 1,
    fare DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, matched, active, completed, cancelled
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    driver_rating INTEGER CHECK (driver_rating >= 1 AND driver_rating <= 5),
    student_rating INTEGER CHECK (student_rating >= 1 AND student_rating <= 5)
);

-- Messages table (ride chat)
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    ride_id INTEGER REFERENCES rides(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_driver_apps_user_id ON driver_applications(user_id);
CREATE INDEX idx_driver_apps_status ON driver_applications(status);
CREATE INDEX idx_rides_student_id ON rides(student_id);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_messages_ride_id ON messages(ride_id);

-- Note: Sample data is now created via signup/registration endpoints
-- Users are created in Supabase Auth first, then inserted here with matching UUIDs
-- To create an admin user, register via signup.html then update account_type to 'admin' via Supabase SQL
