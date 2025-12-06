// This file contains the new server code with PostgreSQL integration
// Please copy this content to server.js after backing up the old one

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'amam_secret_key';

// Initialize Supabase Auth client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }  // Required for Supabase
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection error:', err);
    } else {
        console.log('✅ Database connected at:', res.rows[0].now);
    }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.static(__dirname));

// Admin authorization middleware
function requireAdmin(req, res, next) {
    try {
        const adminKey = process.env.ADMIN_KEY;
        // 1) If ADMIN_KEY is set, allow requests that present it via header `x-admin-key` or query param
        if (adminKey) {
            const provided = req.headers['x-admin-key'] || req.query.adminKey || req.body && req.body.adminKey;
            if (provided && provided === adminKey) return next();
            return res.status(401).json({ error: 'Missing or invalid admin key' });
        }

        // 2) Otherwise, accept a Bearer JWT and verify accountType or role === 'admin'
        const auth = req.headers.authorization || req.headers.Authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing admin token' });
        const token = auth.split(' ')[1];
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            if (payload && (payload.accountType === 'admin' || payload.role === 'admin')) {
                // attach adminId for downstream handlers
                req.adminId = payload.userId || payload.userID || payload.id;
                return next();
            }
            return res.status(403).json({ error: 'Not an admin' });
        } catch (e) {
            return res.status(401).json({ error: 'Invalid admin token' });
        }
    } catch (e) {
        console.warn('requireAdmin error', e);
        return res.status(500).json({ error: 'Server error' });
    }
}

// Debug: list registered routes (temporary)
app.get('/__routes', (req, res) => {
    try {
        const routes = [];
        app._router.stack.forEach(mw => {
            if (mw.route && mw.route.path) {
                const methods = Object.keys(mw.route.methods).join(',').toUpperCase();
                routes.push({ path: mw.route.path, methods });
            }
        });
        res.json({ routes });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// In-memory storage for active sessions
const activeSockets = new Map();
const onlineDrivers = new Map();
// Active offers that approved drivers have published: Map<driverId, { driverId, location, note, fare, timestamp }>
const activeOffers = new Map();
// Pending notifications for users who were offline when an event occurred.
// Map<userId, Array<payload>>; replayed when user joins room or reconnects.
const pendingNotifications = new Map();

// ==================== AUTH ENDPOINTS ====================

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, studentId, university, major, phone } = req.body;
        
        if (!email.endsWith('@sm.imamu.edu.sa')) {
            return res.status(400).json({ error: 'Must use university email (sm.imamu.edu.sa)' });
        }
        
        // Step 1: Create user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: false  // User must verify email
        });

        if (authError) {
            return res.status(400).json({ error: authError.message });
        }

        const authUserId = authData.user.id;

        // Step 2: Create user in PostgreSQL users table with Supabase Auth ID
        const result = await pool.query(
            `INSERT INTO users (id, username, email, student_id, university, major, phone, account_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'student') RETURNING id, username, email, student_id, account_type`,
            [authUserId, username, email, studentId, university, major, phone]
        );
        
        const user = result.rows[0];
        
        // Step 3: Send verification email
        const { error: emailError } = await supabase.auth.resend({
            type: 'signup',
            email: email
        });

        if (emailError) {
            console.warn('Warning: Could not send verification email:', emailError.message);
            // Don't fail registration if email sending fails
        } else {
            console.log('✅ Verification email sent to:', email);
        }
        
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                studentId: user.student_id,
                accountType: user.account_type
            },
            message: 'Verification email sent to ' + email
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === '23505') {
            res.status(400).json({ error: 'Username, email, or student ID already exists' });
        } else {
            res.status(500).json({ error: 'Registration failed: ' + error.message });
        }
    }
});

// Resend verification email via Supabase Auth
app.post('/api/send-verification-email', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Verify user credentials first
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (signInError || !signInData.user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Resend verification email
        const { error: resendError } = await supabase.auth.resend({
            type: 'signup',
            email: email
        });

        if (resendError) {
            return res.status(400).json({ error: resendError.message });
        }

        res.json({ 
            success: true, 
            message: 'Verification email sent to ' + email,
            userId: signInData.user.id 
        });
    } catch (error) {
        console.error('Email send error:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

// Check if email is verified via Supabase Auth
app.post('/api/check-email-verified', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        // Get user from Supabase Auth
        const { data, error } = await supabase.auth.admin.listUsers();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        const user = data.users.find(u => u.email === email);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ 
            emailVerified: user.email_confirmed_at !== null,
            userId: user.id 
        });
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ error: 'Failed to check email verification' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Step 1: Verify credentials with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError || !authData.user) {
            // Log Supabase auth error for debugging (avoid logging passwords)
            try {
                console.warn('Supabase signInWithPassword error:', authError && (authError.message || authError));
            } catch (e) { console.warn('Error logging authError', e); }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Step 2: Check if email is verified
        if (!authData.user.email_confirmed_at) {
            return res.status(403).json({ 
                error: 'Please verify your email first', 
                needsVerification: true 
            });
        }

        // Step 3: Get user profile from PostgreSQL
        const result = await pool.query(
            `SELECT u.*, 
                    da.id as driver_app_id,
                    da.status as driver_status,
                    da.is_active_driver,
                    da.is_online,
                    da.total_rides,
                    da.rating,
                    da.total_earnings
             FROM users u
             LEFT JOIN driver_applications da ON u.id = da.user_id
             WHERE u.id = $1`,
            [authData.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User profile not found' });
        }
        
        const user = result.rows[0];
        
        const token = jwt.sign(
            { userId: user.id, email: user.email, accountType: user.account_type },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name || user.fullName || null,
                phone: user.phone,
                gender: user.gender,
                avatar: user.avatar,
                email: user.email,
                studentId: user.student_id,
                university: user.university,
                major: user.major,
                accountType: user.account_type,
                isVerified: user.is_verified,
                hasDriverApp: !!user.driver_app_id,
                driverStatus: user.driver_status,
                isActiveDriver: user.is_active_driver,
                driverStats: user.is_active_driver ? {
                    totalRides: user.total_rides,
                    rating: parseFloat(user.rating),
                    totalEarnings: parseFloat(user.total_earnings)
                } : null
            }
        });
    } catch (error) {
        console.error('Login error:', error);

        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================== DRIVER APPLICATION ENDPOINTS ====================

app.post('/api/driver-application', async (req, res) => {
    try {
        console.log('POST /api/driver-application body:', req.body);
        const { userId, licenseNumber, vehicleMake, vehicleModel, vehicleYear, vehicleColor, plateNumber } = req.body;
        
        const existing = await pool.query(
            'SELECT id FROM driver_applications WHERE user_id = $1',
            [userId]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'You already have a driver application' });
        }
        
        const result = await pool.query(
            `INSERT INTO driver_applications 
             (user_id, license_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color, plate_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING id, status, applied_at`,
            [userId, licenseNumber, vehicleMake, vehicleModel, vehicleYear, vehicleColor, plateNumber]
        );
        
        res.json({
            success: true,
            application: result.rows[0]
        });
    } catch (error) {
        console.error('Driver application error:', error);
        res.status(500).json({ error: 'Application submission failed: ' + (error.message || error) });
    }
});

app.get('/api/driver-application/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            `SELECT da.*, COALESCE(u.full_name, u.username) as username, u.email, u.student_id
             FROM driver_applications da
             JOIN users u ON da.user_id = u.id
             WHERE da.user_id = $1`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.json({ hasApplication: false });
        }
        
        res.json({
            hasApplication: true,
            application: result.rows[0]
        });
    } catch (error) {
        console.error('Get application error:', error);
        res.status(500).json({ error: 'Failed to get application' });
    }
});

// ==================== ADMIN ENDPOINTS ====================

app.get('/api/admin/pending-students', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, email, student_id, university, major, created_at
             FROM users
             WHERE is_verified = FALSE AND account_type != 'admin'
             ORDER BY created_at DESC`
        );
        
        res.json({ students: result.rows });
    } catch (error) {
        console.error('Get pending students error:', error);
        res.status(500).json({ error: 'Failed to get pending students' });
    }
});

app.get('/api/admin/pending-drivers', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT da.*, COALESCE(u.full_name, u.username) as username, u.email, u.student_id, u.university
             FROM driver_applications da
             JOIN users u ON da.user_id = u.id
             WHERE da.status = 'pending'
             ORDER BY da.applied_at DESC`
        );
        
        res.json({ applications: result.rows });
    } catch (error) {
        console.error('Get pending drivers error:', error);
        res.status(500).json({ error: 'Failed to get pending applications' });
    }
});

// Return approved driver applications for admin listing
app.get('/api/admin/approved-drivers', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT da.*, COALESCE(u.full_name, u.username) as username, u.email, u.student_id, u.university
             FROM driver_applications da
             JOIN users u ON da.user_id = u.id
             WHERE da.status = 'approved'
             ORDER BY da.reviewed_at DESC`
        );

        res.json({ applications: result.rows });
    } catch (error) {
        console.error('Get approved drivers error:', error);
        res.status(500).json({ error: 'Failed to get approved applications' });
    }
});

// -------------------- Announcements --------------------
// Admins can post announcements which are persisted and broadcast to clients
app.post('/api/announcements', requireAdmin, async (req, res) => {
    try {
        const { title, message, type, eventDate, adminId } = req.body || {};
        if (!title || !message) return res.status(400).json({ error: 'Missing title or message' });

        // Ensure announcements table exists
        await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT,
            message TEXT,
            type VARCHAR(50) DEFAULT 'system',
            event_date TIMESTAMP NULL,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        const insert = await pool.query(
            `INSERT INTO announcements (title, message, type, event_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [title, message, type || 'system', eventDate || null, adminId || null]
        );

        const announcement = insert.rows[0];

        // Broadcast to all connected clients; clients will decide how to render
        try { io.emit('newAnnouncement', { announcement }); } catch (e) { console.warn('Failed to emit newAnnouncement', e); }

        res.json({ success: true, announcement });
    } catch (e) {
        console.error('Create announcement error:', e);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

app.get('/api/announcements', async (req, res) => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT,
            message TEXT,
            type VARCHAR(50) DEFAULT 'system',
            event_date TIMESTAMP NULL,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        const r = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100');
        res.json({ announcements: r.rows });
    } catch (e) {
        console.error('Get announcements error:', e);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

// Update an announcement (admin)
app.put('/api/announcements/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, message, type, eventDate } = req.body || {};
        if (!title && !message && !type && !eventDate) return res.status(400).json({ error: 'No fields to update' });

        await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT,
            message TEXT,
            type VARCHAR(50) DEFAULT 'system',
            event_date TIMESTAMP NULL,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        const fields = [];
        const params = [];
        let idx = 1;
        if (title !== undefined) { fields.push(`title = $${idx++}`); params.push(title); }
        if (message !== undefined) { fields.push(`message = $${idx++}`); params.push(message); }
        if (type !== undefined) { fields.push(`type = $${idx++}`); params.push(type); }
        if (eventDate !== undefined) { fields.push(`event_date = $${idx++}`); params.push(eventDate || null); }

        params.push(id);
        const sql = `UPDATE announcements SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
        const r = await pool.query(sql, params);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });
        const announcement = r.rows[0];

        try { io.emit('announcementUpdated', { announcement }); } catch (e) { console.warn('Failed to emit announcementUpdated', e); }

        res.json({ success: true, announcement });
    } catch (e) {
        console.error('Update announcement error:', e);
        res.status(500).json({ error: 'Failed to update announcement' });
    }
});

// Delete an announcement (admin)
app.delete('/api/announcements/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT,
            message TEXT,
            type VARCHAR(50) DEFAULT 'system',
            event_date TIMESTAMP NULL,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        const del = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING id', [id]);
        if (del.rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });

        try { io.emit('announcementDeleted', { id }); } catch (e) { console.warn('Failed to emit announcementDeleted', e); }

        res.json({ success: true, id: del.rows[0].id });
    } catch (e) {
        console.error('Delete announcement error:', e);
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
});

app.post('/api/admin/approve-student', requireAdmin, async (req, res) => {
    try {
        const { studentId } = req.body;
        
        await pool.query(
            'UPDATE users SET is_verified = TRUE WHERE id = $1',
            [studentId]
        );
        
        res.json({ success: true, message: 'Student approved' });
    } catch (error) {
        console.error('Approve student error:', error);
        res.status(500).json({ error: 'Failed to approve student' });
    }
});

// -------------------- Support Tickets --------------------
// Create a ticket (authenticated preferred but allow userId in body for simplicity)
app.post('/api/tickets', async (req, res) => {
    try {
        const { userId, type, subject, body } = req.body || {};
        if (!userId || !type || !subject || !body) return res.status(400).json({ error: 'Missing fields' });

        // ensure tickets table exists (dev-friendly)
        await pool.query(`CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            user_id TEXT,
            type VARCHAR(100),
            subject TEXT,
            body TEXT,
            status VARCHAR(50) DEFAULT 'open',
            admin_reply TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP
        )`);

        const insert = await pool.query(
            `INSERT INTO tickets (user_id, type, subject, body) VALUES ($1,$2,$3,$4) RETURNING *`,
            [userId, type, subject, body]
        );

        const ticket = insert.rows[0];

        // Notify admins via socket room and queue for offline admins
        try {
            io.to('admins').emit('newTicket', { ticket });
        } catch (e) { console.warn('Failed to emit newTicket to admins room', e); }

        // queue per-admin if offline
        try {
            const r = await pool.query("SELECT id FROM users WHERE account_type = 'admin'");
            for (const row of r.rows) {
                const adminId = row.id;
                const sockId = activeSockets.get(adminId);
                if (sockId && io && io.to) {
                    try { io.to(sockId).emit('newTicket', { ticket }); } catch (e) { console.warn('Direct admin emit failed', e); }
                } else {
                    const arr = pendingNotifications.get(adminId) || [];
                    arr.push({ type: 'newTicket', payload: ticket });
                    pendingNotifications.set(adminId, arr);
                }
            }
        } catch (e) { console.warn('Error delivering newTicket to admins', e); }

        res.json({ success: true, ticket });
    } catch (e) {
        console.error('POST /api/tickets error', e);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

// Get tickets for a user
app.get('/api/users/:userId/tickets', async (req, res) => {
    try {
        const { userId } = req.params;
        await pool.query(`CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            user_id TEXT,
            type VARCHAR(100),
            subject TEXT,
            body TEXT,
            status VARCHAR(50) DEFAULT 'open',
            admin_reply TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP
        )`);

        const r = await pool.query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json({ tickets: r.rows });
    } catch (e) {
        console.error('GET /api/users/:userId/tickets error', e);
        res.status(500).json({ error: 'Failed to fetch tickets' });
    }
});

// Admin: list all tickets (optionally filter by status via query ?status=open)
app.get('/api/admin/tickets', requireAdmin, async (req, res) => {
    try {
        const status = req.query.status;
        const where = status ? 'WHERE status = $1' : '';
        const params = status ? [status] : [];
        const r = await pool.query(`SELECT t.*, COALESCE(u.full_name, u.username) as username, u.email FROM tickets t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.created_at DESC`, params);
        res.json({ tickets: r.rows });
    } catch (e) {
        console.error('GET /api/admin/tickets error', e);
        res.status(500).json({ error: 'Failed to fetch admin tickets' });
    }
});

// Admin: review/update a ticket (reply/close)
app.post('/api/admin/tickets/:ticketId/review', requireAdmin, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { adminId, status, adminReply } = req.body || {};
        if (!adminId || !status) return res.status(400).json({ error: 'Missing adminId or status' });

        await pool.query(`CREATE TABLE IF NOT EXISTS tickets (
            id SERIAL PRIMARY KEY,
            user_id TEXT,
            type VARCHAR(100),
            subject TEXT,
            body TEXT,
            status VARCHAR(50) DEFAULT 'open',
            admin_reply TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP
        )`);

        const upd = await pool.query('UPDATE tickets SET status = $1, admin_reply = $2, updated_at = NOW() WHERE id = $3 RETURNING *', [status, adminReply || null, ticketId]);
        if (upd.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });

        const ticket = upd.rows[0];

        // Notify ticket owner
        try {
            const room = `user:${ticket.user_id}`;
            io.to(room).emit('ticketUpdated', { ticket });
            const sock = activeSockets.get(ticket.user_id);
            if (sock) io.to(sock).emit('ticketUpdated', { ticket });
            // If not delivered, queue
            if (!sock) {
                const arr = pendingNotifications.get(ticket.user_id) || [];
                arr.push({ type: 'ticketUpdated', payload: ticket });
                pendingNotifications.set(ticket.user_id, arr);
            }
        } catch (e) { console.warn('Failed to notify ticket owner', e); }

        res.json({ success: true, ticket });
    } catch (e) {
        console.error('POST /api/admin/tickets/:ticketId/review error', e);
        res.status(500).json({ error: 'Failed to review ticket' });
    }
});

app.post('/api/admin/review-driver', requireAdmin, async (req, res) => {
    try {
        const { applicationId, adminId, approved, reason } = req.body;
        
        const status = approved ? 'approved' : 'rejected';
        
        await pool.query(
            `UPDATE driver_applications 
             SET status = $1, reviewed_at = NOW(), reviewed_by = $2, 
                 rejection_reason = $3, is_active_driver = $4
             WHERE id = $5`,
            [status, adminId, reason, approved, applicationId]
        );
        
        // Fetch the updated application to get the applicant user id
        const appRes = await pool.query('SELECT * FROM driver_applications WHERE id = $1', [applicationId]);
        const appRow = appRes.rows[0];

        // Notify applicant via Socket.IO if they are connected
        if (appRow && appRow.user_id) {
            const userId = appRow.user_id;
            const socketId = activeSockets.get(userId);
            const payload = {
                applicationId,
                status,
                approved: !!approved,
                reason: reason || null,
                userId
            };
            try {
                // If specific socket is connected, emit directly for lower latency
                // If a specific socketId mapping exists, emit directly
                let delivered = false;
                if (socketId && io && io.to) {
                    try {
                        io.to(socketId).emit('driverStatusUpdated', payload);
                        console.log(`Emitted driverStatusUpdated to user ${userId} at socket ${socketId}`, payload);
                        delivered = true;
                    } catch (e) {
                        console.warn('Direct emit failed', e.message || e);
                    }
                }

                // Emit to the user's room as the primary scalable delivery method.
                try {
                    const room = `user:${userId}`;
                    // If the room exists and has members, emit and mark delivered
                    const roomSet = io.sockets.adapter.rooms.get(room);
                    if (roomSet && roomSet.size > 0) {
                        io.to(room).emit('driverStatusUpdated', payload);
                        console.log(`Emitted driverStatusUpdated to room ${room}`, payload);
                        delivered = true;
                    } else {
                        console.log(`Room ${room} has no members right now`);
                    }
                } catch (e) {
                    console.warn('Failed to emit to user room:', e.message || e);
                }

                // If not delivered to any connected socket, store for replay when user reconnects/joins room
                if (!delivered) {
                    const arr = pendingNotifications.get(userId) || [];
                    arr.push(payload);
                    pendingNotifications.set(userId, arr);
                    console.log(`Stored pending notification for user ${userId}. Total pending: ${arr.length}`);
                }
            } catch (e) {
                console.warn('Failed to emit driverStatusUpdated:', e.message || e);
            }
        }

        res.json({ success: true, message: `Driver application ${status}` });
    } catch (error) {
        console.error('Review driver error:', error);
        res.status(500).json({ error: 'Failed to review application' });
    }
});

// Return the current user's profile based on JWT in Authorization header
app.get('/api/users/me', async (req, res) => {
    try {
        const auth = req.headers.authorization || req.headers.Authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
        const token = auth.split(' ')[1];
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const userId = payload.userId || payload.userID || payload.id;
        if (!userId) return res.status(400).json({ error: 'Invalid token payload' });

        const result = await pool.query(
            `SELECT u.*, 
                    da.id as driver_app_id,
                    da.status as driver_status,
                    da.is_active_driver,
                    da.is_online,
                    da.total_rides,
                    da.rating,
                    da.total_earnings
             FROM users u
             LEFT JOIN driver_applications da ON u.id = da.user_id
             WHERE u.id = $1`,
            [userId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = result.rows[0];

        res.json({
            id: user.id,
            username: user.username,
            fullName: user.full_name || user.fullName || null,
            phone: user.phone,
            gender: user.gender,
            avatar: user.avatar,
            email: user.email,
            studentId: user.student_id,
            university: user.university,
            major: user.major,
            phone: user.phone,
            accountType: user.account_type,
            isVerified: user.is_verified,
            driverAppId: user.driver_app_id,
            driverStatus: user.driver_status,
            isActiveDriver: user.is_active_driver,
            driverStats: user.is_active_driver ? {
                totalRides: user.total_rides,
                rating: parseFloat(user.rating || 0),
                totalEarnings: parseFloat(user.total_earnings || 0)
            } : null
        });
    } catch (error) {
        console.error('Get /api/users/me error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update current user's profile (protected)
app.post('/api/users/update', async (req, res) => {
    try {
        const auth = req.headers.authorization || req.headers.Authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
        const token = auth.split(' ')[1];
        let payload;
        try { payload = jwt.verify(token, JWT_SECRET); } catch (err) { return res.status(401).json({ error: 'Invalid token' }); }

        const userId = payload.userId || payload.userID || payload.id;
        console.log(`/api/users/update called by userId=${userId}`);
        if (!userId) return res.status(400).json({ error: 'Invalid token payload' });

        const { username, phone, major, gender, fullName, avatar } = req.body || {};

        // Build a dynamic update statement for only provided fields
        const updates = [];
        const values = [];
        let idx = 1;
        // Ensure optional columns exist so RETURNING/selects won't fail on older schemas
        try {
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50)`);
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(200)`);
            await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`);
        } catch (e) {
            console.warn('Could not ensure optional profile columns exist:', e.message || e);
        }
        if (username !== undefined) { updates.push(`username = $${idx++}`); values.push(username); }
        if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone); }
        if (major !== undefined) { updates.push(`major = $${idx++}`); values.push(major); }
        if (gender !== undefined) {
            // ensure gender column exists for older schemas
            try {
                await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50)`);
            } catch (e) {
                console.warn('Could not ensure gender column exists:', e.message || e);
            }
            updates.push(`gender = $${idx++}`); values.push(gender);
        }
        if (fullName !== undefined) {
            // ensure the column exists (safe to run on every request)
            try {
                await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(200)`);
            } catch (e) {
                console.warn('Could not ensure full_name column exists:', e.message || e);
            }
            updates.push(`full_name = $${idx++}`); values.push(fullName);
        }
        if (avatar !== undefined) {
            // ensure avatar column exists
            try {
                await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`);
            } catch (e) {
                console.warn('Could not ensure avatar column exists:', e.message || e);
            }
            updates.push(`avatar = $${idx++}`); values.push(avatar);
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        // add updated_at
        updates.push(`updated_at = NOW()`);

        const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, email, student_id, university, major, phone, account_type, gender, is_verified, avatar, full_name`;
        values.push(userId);

        const result = await pool.query(sql, values);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        // Map DB row (snake_case) to client-friendly camelCase shape
        const r = result.rows[0];
        const mapped = {
            id: r.id,
            username: r.username,
            fullName: r.full_name || r.fullName || null,
            email: r.email,
            studentId: r.student_id,
            university: r.university,
            major: r.major,
            phone: r.phone,
            accountType: r.account_type,
            gender: r.gender,
            isVerified: r.is_verified,
            avatar: r.avatar
        };

        res.json({ success: true, user: mapped });
    } catch (error) {
        console.error('Update profile error:', error);
        // Provide a clearer error message to the client for easier debugging (avoid leaking secrets)
        res.status(500).json({ error: 'Failed to update profile: ' + (error && error.message ? error.message : String(error)) });
    }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE is_verified = FALSE AND account_type != 'admin') as pending_students,
                (SELECT COUNT(*) FROM users WHERE is_verified = TRUE AND account_type != 'admin') as approved_students,
                (SELECT COUNT(*) FROM driver_applications WHERE status = 'pending') as pending_drivers,
                (SELECT COUNT(*) FROM driver_applications WHERE status = 'approved') as approved_drivers,
                (SELECT COUNT(*) FROM rides) as total_rides,
                (SELECT COUNT(*) FROM rides WHERE status = 'completed') as completed_rides
        `);
        
        res.json({ stats: stats.rows[0] });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// ==================== RIDE ENDPOINTS ====================

app.post('/api/rides', async (req, res) => {
    try {
        const { studentId } = req.body || {};

        // Defensive normalization for pickup/destination payloads.
        const rawPickup = req.body && req.body.pickup ? req.body.pickup : null;
        const rawDestination = req.body && req.body.destination ? req.body.destination : null;
        const passengers = req.body && req.body.passengers ? req.body.passengers : 1;
        const fare = req.body && (req.body.fare !== undefined) ? req.body.fare : null;

        function normalizePlace(p) {
            if (!p) return { location: null, lat: null, lng: null };
            if (typeof p === 'string') return { location: p, lat: null, lng: null };
            // Accept multiple naming conventions from clients
            const location = p.location || p.name || p.address || null;
            const lat = p.lat || p.latitude || (p.coords && p.coords.lat) || null;
            const lng = p.lng || p.longitude || (p.coords && p.coords.lng) || null;
            return { location, lat, lng };
        }

        const pickup = normalizePlace(rawPickup);
        const destination = normalizePlace(rawDestination);

        // Ensure required fields exist (studentId at minimum)
        if (!studentId) return res.status(400).json({ error: 'Missing studentId' });

        const result = await pool.query(
            `INSERT INTO rides 
             (student_id, pickup_location, pickup_lat, pickup_lng, destination_location, 
              destination_lat, destination_lng, passengers, fare)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [studentId, pickup.location, pickup.lat, pickup.lng,
             destination.location, destination.lat, destination.lng, passengers, fare]
        );

        const ride = result.rows[0];
        try { io.emit('newRideRequest', { ride }); } catch (e) { console.warn('Emit newRideRequest failed', e); }

        res.json({ success: true, ride });
    } catch (error) {
        console.error('Create ride error:', error, 'payload:', { body: req.body });
        res.status(500).json({ error: 'Failed to create ride', details: error && error.message ? error.message : String(error) });
    }
});

// HTTP fallback endpoint to create an emergency alert (also notifies admins)
app.post('/api/emergency', async (req, res) => {
    try {
        const { userId, location, message } = req.body || {};
        const alertPayload = { fromUserId: userId || null, location: location || null, message: message || 'Emergency alert', timestamp: Date.now() };

        // Emit to admins room
        try { io.to('admins').emit('emergencyAlert', alertPayload); } catch (e) { console.warn('Failed to emit to admins room', e); }

        // Queue/deliver to admins by ID
        try {
            const r = await pool.query("SELECT id FROM users WHERE account_type = 'admin'");
            const admins = r.rows.map(row => row.id);
            for (const adminId of admins) {
                const sockId = activeSockets.get(adminId);
                if (sockId && io && io.to) {
                    try { io.to(sockId).emit('emergencyAlert', alertPayload); } catch (e) { console.warn('Direct admin emit failed', e); }
                } else {
                    const arr = pendingNotifications.get(adminId) || [];
                    arr.push({ type: 'emergencyAlert', payload: alertPayload });
                    pendingNotifications.set(adminId, arr);
                }
            }
        } catch (e) { console.warn('Error delivering/queuing emergency via HTTP', e); }

        res.json({ success: true, alert: alertPayload });
    } catch (e) {
        console.error('POST /api/emergency error', e);
        res.status(500).json({ error: 'Failed to process emergency' });
    }
});

app.get('/api/rides/student/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        const result = await pool.query(
            `SELECT r.*, 
                    COALESCE(d.full_name, d.username) as driver_name, d.phone as driver_phone,
                    da.vehicle_make, da.vehicle_model, da.vehicle_color, da.plate_number
             FROM rides r
             LEFT JOIN users d ON r.driver_id = d.id
             LEFT JOIN driver_applications da ON d.id = da.user_id
             WHERE r.student_id = $1 AND r.status IN ('pending', 'matched', 'active')
             ORDER BY r.requested_at DESC`,
            [studentId]
        );
        
        res.json({ rides: result.rows });
    } catch (error) {
        console.error('Get student rides error:', error);
        res.status(500).json({ error: 'Failed to get rides' });
    }
});

// Get rides for a driver (matched/active)
app.get('/api/rides/driver/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        const result = await pool.query(
            `SELECT r.*, COALESCE(u.full_name, u.username) as student_name, u.phone as student_phone
             FROM rides r
             LEFT JOIN users u ON r.student_id = u.id
             WHERE r.driver_id = $1 AND r.status IN ('matched','active')
             ORDER BY r.accepted_at DESC`,
            [driverId]
        );
        res.json({ rides: result.rows });
    } catch (error) {
        console.error('Get driver rides error:', error);
        res.status(500).json({ error: 'Failed to get driver rides' });
    }
});

app.get('/api/rides/available', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, COALESCE(u.full_name, u.username) as student_name, u.phone as student_phone
             FROM rides r
             JOIN users u ON r.student_id = u.id
             WHERE r.status = 'pending'
             ORDER BY r.requested_at DESC
             LIMIT 20`
        );
        
        res.json({ rides: result.rows });
    } catch (error) {
        console.error('Get available rides error:', error);
        res.status(500).json({ error: 'Failed to get available rides' });
    }
});

app.post('/api/rides/:rideId/accept', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { driverId } = req.body;
        // Ensure driver doesn't have another active or matched ride
        const drvCheck = await pool.query(
            `SELECT id FROM rides WHERE driver_id = $1 AND status IN ('matched','active') LIMIT 1`,
            [driverId]
        );
        if (drvCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Driver already has an active ride' });
        }

        const result = await pool.query(
            `UPDATE rides 
             SET driver_id = $1, status = 'matched', accepted_at = NOW()
             WHERE id = $2 AND status = 'pending'
             RETURNING *`,
            [driverId, rideId]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Ride not available' });
        }
        
        // Fetch ride with joined driver and student info for richer client payload
        const rideFullRes = await pool.query(
            `SELECT r.*,
                    COALESCE(ud.full_name, ud.username) as driver_name,
                    ud.phone as driver_phone,
                    ud.avatar as driver_avatar,
                    COALESCE(us.full_name, us.username) as student_name,
                    us.phone as student_phone,
                    us.avatar as student_avatar
             FROM rides r
             LEFT JOIN users ud ON r.driver_id = ud.id
             LEFT JOIN users us ON r.student_id = us.id
             WHERE r.id = $1`,
            [rideId]
        );
        const ride = rideFullRes.rows[0] || result.rows[0];

        // Emit to passenger and driver rooms specifically
        try {
            if (ride && ride.student_id) {
                io.to(`user:${ride.student_id}`).emit('rideAccepted', { ride });
            }
            if (ride && ride.driver_id) {
                io.to(`user:${ride.driver_id}`).emit('rideAccepted', { ride });
            }
        } catch (e) {
            console.warn('Failed to emit rideAccepted to rooms, falling back to broadcast', e);
            io.emit('rideAccepted', { ride });
        }

        res.json({ success: true, ride });
    } catch (error) {
        console.error('Accept ride error:', error);
        res.status(500).json({ error: 'Failed to accept ride' });
    }
});

// Cancel a ride (allowed for driver or student). Cancellation window: 2 minutes after accept.
app.post('/api/rides/:rideId/cancel', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { userId } = req.body; // id of the caller (driver or student)

        const r = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Ride not found' });
        const ride = r.rows[0];

        if (!ride.accepted_at) return res.status(400).json({ error: 'Ride has not been accepted yet' });

        const acceptedAt = new Date(ride.accepted_at);
        const now = new Date();
        const diffMs = now - acceptedAt;
        const twoMinutesMs = 2 * 60 * 1000;

        if (diffMs > twoMinutesMs) {
            return res.status(400).json({ error: 'Cancellation window expired' });
        }

        // Only passenger or assigned driver may cancel
        if (userId !== ride.student_id && userId !== ride.driver_id) {
            return res.status(403).json({ error: 'Not authorized to cancel this ride' });
        }

        await pool.query('UPDATE rides SET status = $1, cancelled_at = NOW() WHERE id = $2', ['cancelled', rideId]);

        // Notify both parties
        try {
            if (ride.student_id) io.to(`user:${ride.student_id}`).emit('rideCancelled', { rideId });
            if (ride.driver_id) io.to(`user:${ride.driver_id}`).emit('rideCancelled', { rideId });
        } catch (e) { console.warn('Failed to emit rideCancelled', e); }

        res.json({ success: true, rideId });
    } catch (e) {
        console.error('Cancel ride error:', e);
        res.status(500).json({ error: 'Failed to cancel ride' });
    }
});

// End / complete a ride. Can be invoked by driver or passenger. If invoked by passenger, driverId is inferred.
app.post('/api/rides/:rideId/end', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { userId, fare } = req.body || {};

        const r = await pool.query('SELECT * FROM rides WHERE id = $1', [rideId]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Ride not found' });
        const ride = r.rows[0];

        // Only allow if ride is matched or active
        if (!['matched','active'].includes(ride.status)) return res.status(400).json({ error: 'Ride is not active' });

        // Authorization: caller must be driver or passenger
        if (userId !== ride.student_id && userId !== ride.driver_id) {
            return res.status(403).json({ error: 'Not authorized to end this ride' });
        }

        // Mark completed
        await pool.query('UPDATE rides SET status = $1, completed_at = NOW() WHERE id = $2', ['completed', rideId]);

        // If fare provided and driver exists, update driver earnings
        try {
            const driverId = ride.driver_id;
            const parsedFare = fare !== undefined ? parseFloat(fare) : (ride.fare ? parseFloat(ride.fare) : 0);
            if (driverId && parsedFare) {
                await pool.query('UPDATE driver_applications SET total_rides = COALESCE(total_rides,0) + 1, total_earnings = COALESCE(total_earnings,0) + $1 WHERE user_id = $2', [parsedFare, driverId]);
            }
        } catch (e) { console.warn('Failed to update driver earnings', e); }

        try {
            if (ride.student_id) io.to(`user:${ride.student_id}`).emit('rideEnded', { rideId });
            if (ride.driver_id) io.to(`user:${ride.driver_id}`).emit('rideEnded', { rideId });
        } catch (e) { console.warn('Failed to emit rideEnded', e); }

        res.json({ success: true, rideId });
    } catch (e) {
        console.error('End ride error:', e);
        res.status(500).json({ error: 'Failed to end ride' });
    }
});

app.post('/api/rides/:rideId/complete', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { driverId, fare } = req.body;
        
        const rideResult = await pool.query(
            `UPDATE rides 
             SET status = 'completed', completed_at = NOW()
             WHERE id = $1 AND driver_id = $2
             RETURNING *`,
            [rideId, driverId]
        );
        
        if (rideResult.rows.length === 0) {
            return res.status(400).json({ error: 'Ride not found' });
        }
        
        await pool.query(
            `UPDATE driver_applications 
             SET total_rides = total_rides + 1, total_earnings = total_earnings + $1
             WHERE user_id = $2`,
            [fare, driverId]
        );
        
        res.json({ success: true, ride: rideResult.rows[0] });
    } catch (error) {
        console.error('Complete ride error:', error);
        res.status(500).json({ error: 'Failed to complete ride' });
    }
});

// Create or fetch reviews for a ride
app.get('/api/rides/:rideId/reviews', async (req, res) => {
    try {
        const { rideId } = req.params;
        // ensure reviews table exists
        await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY,
            ride_id INTEGER,
            reviewer_id TEXT,
            target_id TEXT,
            rating INTEGER,
            comment TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        const r = await pool.query('SELECT * FROM reviews WHERE ride_id = $1 ORDER BY created_at ASC', [rideId]);
        res.json({ reviews: r.rows });
    } catch (e) {
        console.error('GET /api/rides/:rideId/reviews error', e);
        res.status(500).json({ error: 'Failed to get reviews' });
    }
});

// Submit a review for a ride (either passenger->driver or driver->passenger)
app.post('/api/rides/:rideId/review', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { reviewerId, targetId, rating, comment } = req.body || {};
        if (!reviewerId || !targetId || !rating) return res.status(400).json({ error: 'Missing fields' });

        // ensure reviews table exists
        await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY,
            ride_id INTEGER,
            reviewer_id TEXT,
            target_id TEXT,
            rating INTEGER,
            comment TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        const insert = await pool.query(
            `INSERT INTO reviews (ride_id, reviewer_id, target_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [rideId, reviewerId, targetId, rating, comment]
        );

        const review = insert.rows[0];

        // Recalculate average rating for target if target is a driver (exists in driver_applications)
        try {
            const avgRes = await pool.query('SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE target_id = $1', [targetId]);
            const avg = parseFloat(avgRes.rows[0].avg_rating || 0).toFixed(2);
            const cnt = parseInt(avgRes.rows[0].cnt || 0);
            // update driver_applications if target is a driver user
            await pool.query(`UPDATE driver_applications SET rating = $1 WHERE user_id = $2`, [avg, targetId]).catch(()=>{});
            // also store total reviews maybe in users table or driver_applications; skip if missing
        } catch (e) {
            console.warn('Could not recalc/update rating:', e.message || e);
        }

        // notify the target user via socket/room
        try {
            const room = `user:${targetId}`;
            io.to(room).emit('reviewSubmitted', { review });
            // also direct emit if socket mapping exists
            const sock = activeSockets.get(targetId);
            if (sock) io.to(sock).emit('reviewSubmitted', { review });
        } catch (e) { console.warn('Failed to emit reviewSubmitted', e); }

        res.json({ success: true, review });
    } catch (e) {
        console.error('POST /api/rides/:rideId/review error', e);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('authenticate', (userId) => {
        try {
            // Accept either a raw userId or a JWT token
            let resolvedUserId = userId;
            // If a JWT was passed, decode it and capture accountType to help admin routing
            if (typeof userId === 'string' && userId.split('.').length === 3) {
                try {
                    const payload = jwt.verify(userId, JWT_SECRET);
                    resolvedUserId = payload.userId || payload.userID || payload.id;
                    // If admin, join the 'admins' room for easier delivery
                    if (payload.accountType === 'admin') {
                        try { socket.join('admins'); console.log(`Socket ${socket.id} joined admins room`); } catch (e) {}
                    }
                } catch (err) {
                    console.warn('Socket auth: invalid token provided');
                    resolvedUserId = null;
                }
            }

            if (resolvedUserId) {
                activeSockets.set(resolvedUserId, socket.id);
                console.log(`User ${resolvedUserId} authenticated (socket ${socket.id})`);
            } else {
                console.warn('Socket authenticate failed - no valid userId');
            }
        } catch (err) {
            console.warn('Socket authenticate error', err);
        }
    });

    // Emergency alerts from clients (drivers or passengers)
    socket.on('emergencyAlert', async (data) => {
        try {
            // data: { userId, location: {lat,lng}, message }
            if (!data) return;
            const alertPayload = {
                fromUserId: data.userId || null,
                location: data.location || null,
                message: data.message || 'Emergency alert',
                timestamp: Date.now()
            };

            // 1) Emit to connected admins who joined the 'admins' room
            try {
                io.to('admins').emit('emergencyAlert', alertPayload);
            } catch (e) { console.warn('Failed to emit to admins room', e); }

            // 2) Also query admin user IDs and deliver individually (store pending for offline admins)
            try {
                const r = await pool.query("SELECT id FROM users WHERE account_type = 'admin'");
                const admins = r.rows.map(row => row.id);
                for (const adminId of admins) {
                    const sockId = activeSockets.get(adminId);
                    if (sockId && io && io.to) {
                        try {
                            io.to(sockId).emit('emergencyAlert', alertPayload);
                        } catch (e) { console.warn('Direct admin emit failed', e); }
                    } else {
                        // Queue for replay when admin connects
                        const arr = pendingNotifications.get(adminId) || [];
                        arr.push({ type: 'emergencyAlert', payload: alertPayload });
                        pendingNotifications.set(adminId, arr);
                        console.log(`Queued emergency alert for offline admin ${adminId}`);
                    }
                }
            } catch (e) {
                console.warn('Failed querying admins for emergency delivery', e);
            }

            console.log('Emergency alert processed:', alertPayload);
        } catch (e) {
            console.warn('emergencyAlert handler error', e);
        }
    });

    // Support lightweight room join by userId so we can emit to rooms without requiring JWT
    socket.on('joinUserRoom', (userId) => {
        try {
            if (!userId) return;
            const room = `user:${userId}`;
            socket.join(room);
            console.log(`Socket ${socket.id} joined room ${room}`);
            // keep mapping as well
            activeSockets.set(userId, socket.id);
            // If there are pending notifications for this user, replay them now
            try {
                const pending = pendingNotifications.get(userId);
                if (pending && pending.length > 0) {
                    pending.forEach(p => {
                        try { io.to(room).emit('driverStatusUpdated', p); } catch (e) { console.warn('Replay emit failed', e); }
                    });
                    pendingNotifications.delete(userId);
                    console.log(`Replayed ${pending.length} pending notifications for user ${userId}`);
                }
            } catch (e) {
                console.warn('Error replaying pending notifications', e);
            }
            // Send currently active driver offers (so passengers joining after offers still see them)
            try {
                const offers = Array.from(activeOffers.values());
                if (offers.length > 0) {
                    io.to(room).emit('activeDriverOffers', { offers });
                }
            } catch (e) {
                console.warn('Error sending active offers to room', e);
            }
        } catch (err) {
            console.warn('joinUserRoom error', err);
        }
    });
    
    // Allow clients (drivers and passengers) to join a ride-specific room so chat messages can be routed to participants
    socket.on('joinRideRoom', (rideId) => {
        try {
            if (!rideId) return;
            const room = `ride:${rideId}`;
            socket.join(room);
            console.log(`Socket ${socket.id} joined ride room ${room}`);
        } catch (e) {
            console.warn('joinRideRoom error', e);
        }
    });

    // Allow admin dashboards to request joining the admins room.
    // If ADMIN_KEY env var is set, clients must pass it in the payload { adminKey }
    // Otherwise joining is allowed for development convenience or via JWT passed as payload.
    socket.on('adminJoin', (payload) => {
        try {
            const adminKey = process.env.ADMIN_KEY || null;
            // If ADMIN_KEY configured, require it
            if (adminKey) {
                if (!payload || payload.adminKey !== adminKey) {
                    console.warn(`Socket ${socket.id} attempted adminJoin without valid adminKey`);
                    return;
                }
                socket.join('admins');
                console.log(`Socket ${socket.id} joined admins room (adminKey)`);
                return;
            }

            // Otherwise, if payload appears to be a JWT token string, verify and ensure accountType === 'admin'
            if (typeof payload === 'string' && payload.split && payload.split('.').length === 3) {
                try {
                    const pl = jwt.verify(payload, JWT_SECRET);
                    if (pl && (pl.accountType === 'admin' || pl.role === 'admin')) {
                        socket.join('admins');
                        console.log(`Socket ${socket.id} joined admins room (jwt)`);
                        return;
                    } else {
                        console.warn(`Socket ${socket.id} provided JWT but not admin`);
                        return;
                    }
                } catch (e) {
                    console.warn('adminJoin JWT verify failed', e.message || e);
                    return;
                }
            }

            // Fallback: no ADMIN_KEY and no JWT provided — allow join (development mode)
            socket.join('admins');
            console.log(`Socket ${socket.id} joined admins room (dev fallback)`);
        } catch (e) {
            console.warn('adminJoin error', e);
        }
    });

    socket.on('driverOnline', async (data) => {
        const { driverId, location } = data;
        onlineDrivers.set(driverId, { 
            socketId: socket.id, 
            location,
            driverId 
        });
        
        await pool.query(
            'UPDATE driver_applications SET is_online = TRUE WHERE user_id = $1',
            [driverId]
        );
        
        console.log(`Driver ${driverId} is online`);
    });
    
    socket.on('driverOffline', async (driverId) => {
        onlineDrivers.delete(driverId);

        // If the driver had an active offer, remove it and notify clients
        try {
            if (activeOffers.has(driverId)) {
                activeOffers.delete(driverId);
                io.emit('driverOfferRemoved', { driverId });
            }
        } catch (e) { console.warn('Error removing active offer on offline', e); }
        
        await pool.query(
            'UPDATE driver_applications SET is_online = FALSE WHERE user_id = $1',
            [driverId]
        );
        
        console.log(`Driver ${driverId} is offline`);
    });

    // Driver publishes an offer from a specific location (approved drivers only)
    socket.on('offerRide', (data) => {
        try {
            // data: { driverId, location: { lat, lng }, note?, fare?, name?, avatar? }
            if (!data || !data.driverId || !data.location) return;
            const payload = {
                driverId: data.driverId,
                location: data.location,
                note: data.note || null,
                fare: data.fare || null,
                name: data.name || null,
                avatar: data.avatar || null,
                timestamp: Date.now()
            };
            activeOffers.set(data.driverId, payload);
            // Broadcast to all connected clients (could be optimized by proximity)
            io.emit('driverOffering', payload);
            console.log(`Driver ${data.driverId} published an offer`, payload);
        } catch (e) {
            console.warn('offerRide handler error', e);
        }
    });

    socket.on('cancelOffer', (data) => {
        try {
            const driverId = (typeof data === 'object' && data.driverId) ? data.driverId : data;
            if (!driverId) return;
            if (activeOffers.has(driverId)) {
                activeOffers.delete(driverId);
                io.emit('driverOfferRemoved', { driverId });
                console.log(`Driver ${driverId} cancelled their offer`);
            }
        } catch (e) { console.warn('cancelOffer error', e); }
    });
    
    socket.on('locationUpdate', (data) => {
        const { userId, location } = data;
        
        if (onlineDrivers.has(userId)) {
            const driver = onlineDrivers.get(userId);
            driver.location = location;
            onlineDrivers.set(userId, driver);
            
            io.emit('driverLocationUpdate', { driverId: userId, location });
        }
    });
    
    socket.on('chatMessage', async (data) => {
        const { rideId, senderId, message } = data;
        
        await pool.query(
            'INSERT INTO messages (ride_id, sender_id, message) VALUES ($1, $2, $3)',
            [rideId, senderId, message]
        );
        
        // Emit chat message to the ride-specific room so only participants receive it
        try {
            const room = `ride:${rideId}`;
            io.to(room).emit('chatMessage', { rideId, senderId, message, timestamp: new Date() });
        } catch (e) {
            console.warn('Failed to emit chatMessage to ride room, falling back to broadcast', e);
            io.emit('chatMessage', { rideId, senderId, message, timestamp: new Date() });
        }
    });
    
    socket.on('typing', (data) => {
        socket.broadcast.emit('userTyping', data);
    });
    
    socket.on('disconnect', () => {
        for (let [userId, socketId] of activeSockets.entries()) {
            if (socketId === socket.id) {
                activeSockets.delete(userId);
                onlineDrivers.delete(userId);
                // remove any active offer for this user and notify others
                try {
                    if (activeOffers.has(userId)) {
                        activeOffers.delete(userId);
                        io.emit('driverOfferRemoved', { driverId: userId });
                    }
                } catch (e) { console.warn('Error removing active offer on disconnect', e); }
                break;
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

// ==================== SERVER START ====================

// Improve error handling for listen failures (e.g., EADDRINUSE)
server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`✋ Port ${PORT} is already in use. Stop the other process or set a different PORT environment variable.`);
        console.error('Tip: run `lsof -iTCP:3000 -sTCP:LISTEN -Pn` to find the PID, then `kill <PID>` to free the port.');
        process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO ready for connections`);
});
