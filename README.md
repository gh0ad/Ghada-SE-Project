# Amam - Student Ride Sharing App

A Modern ride-sharing App **exclusively for imam university**.

![Amam Logo](https://img.shields.io/badge/Amam-Student%20Ride%20Sharing-blue?style=for-the-badge)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white)

## 📢 Latest Update: Multi-Tab Dashboard 🎉

**November 5, 2025** - Complete dashboard redesign with 4-tab navigation system:

✨ **New Features**:
- 🏠 **Home Tab**: Request rides, interactive map, real-time chat
- 📢 **Announcements Tab**: System notifications & university events
- 🚗 **Driver Application**: Students can apply to become drivers
- 👤 **Profile Tab**: User settings & statistics

✨ **Smart Role-Based Access**:
- **Students**: See all 4 tabs (full access)
- **Faculty**: See 3 tabs (driver app hidden)
- **Drivers**: Redirected to driver-dashboard.html

✨ **Responsive Design**: Works on desktop, tablet, and mobile

📖 **Full Documentation**: 8 guides included (see below)

**→ [View Dashboard Documentation](#dashboard-documentation)**

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Dashboard Documentation](#dashboard-documentation)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Pages](#pages)
- [Real-Time Features](#real-time-features)
- [Technologies](#technologies)
- [Security](#security)

## Overview

Amam is a student ride-sharing platform that ensures safety through mandatory university verification. Both riders and drivers must be verified students, creating a trusted campus community for affordable, convenient transportation.

## Dashboard Documentation

**[📖 Dashboard Architecture Guide](./DASHBOARD_ARCHITECTURE.md)** - Technical implementation details
- Multi-tab interface design (4 tabs for students, 3 for faculty)
- Component structure and layout system
- API integration patterns
- Real-time Socket.IO events

**[👥 User Guide](./DASHBOARD_GUIDE.md)** - Complete feature walkthrough
- How to request a ride
- Announcements and university events
- Driver application process
- Profile and settings management

**[🔐 Authentication Flow](./LOGIN_REDIRECT_GUIDE.md)** - Role-based access
- Login verification process
- Role detection and tab visibility
- Email verification requirements
- Redirect logic for students, faculty, and drivers

**[✅ QA Checklist](./IMPLEMENTATION_CHECKLIST.md)** - Testing procedures
- 50+ manual test cases
- Mobile responsiveness tests
- API endpoint verification
- Real-time feature testing

**[📚 More Resources](./DOCUMENTATION_INDEX.md)** - Complete documentation index
- Quick reference guide
- Usage examples with real scenarios
- Troubleshooting guide
- Support contact information

## Features

###  Student Verification System
- **University Email Required** - All users must register with .edu email addresses
- **Student ID Verification** - Admin verification of student credentials before account activation
- **Driver Background Checks** - Additional verification for student drivers (license, vehicle, insurance)
- **Trusted Community** - Only verified students can access the platform

### Real-Time Ride Tracking
- **Live GPS Tracking** - See your driver's location in real-time using Leaflet.js maps
- **Route Visualization** - Visual route from driver to student with ETA updates
- **Location Updates** - Automatic location refresh via Socket.io
- **Map Controls** - Center map, toggle traffic, zoom controls

### Instant Messaging
- **Real-Time Chat** - Communicate with your driver using Socket.io
- **Typing Indicators** - See when your driver is typing
- **Message History** - Full conversation history during ride
- **Instant Notifications** - Get notified of new messages immediately

###  Smart Ride Matching
- **Automatic Driver Matching** - Find the nearest available student driver
- **Campus Routes** - Preset destinations (university buildings, dorms, metro stations)
- **Passenger Selection** - Choose number of passengers (1-4)
- **Fair Pricing** - Student-friendly rates

### Role-Based Access
- **Student (Rider)** - Request rides, track drivers, chat
- **Student Driver** - Accept rides, update location, earn money
- **Admin** - Verify students, manage platform, ensure safety

## Project Structure

```
project/
├── public/
│   ├── index.html              # Landing page
│   ├── login.html              # Login page (role-based)
│   ├── signup.html             # Student registration
│   ├── student-dashboard.html  # Student ride request dashboard
│   ├── driver-dashboard.html   # Driver dashboard ✅
│   └── admin-dashboard.html    # Admin verification panel ✅
├── server.js                   # Node.js + Socket.io server
├── package.json                # Dependencies
├── README.md                   # Documentation
├── QUICKSTART.md               # Quick start guide
└── DASHBOARDS.md               # Complete dashboard guide
```

## Installation

### Prerequisites
- **Node.js** (v14 or higher)
- **npm** (Node Package Manager)

### Steps

1. **Navigate to project directory**
   ```bash
   cd c:\Users\moham\Desktop\project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

## Usage

### For Students (Riders)

1. **Sign Up** - Visit signup.html and register with:
   - University email (.edu)
   - Student ID
   - Personal information
   
2. **Wait for Verification** - Admin will verify your credentials (24-48 hours)

3. **Login** - Use login.html with role "Student (Rider)"

4. **Request Ride**:
   - Enter pickup location
   - Select destination (campus/metro)
   - Choose number of passengers
   - Click "Find Driver"

5. **Track & Chat**:
   - View driver location on map
   - Chat in real-time
   - Get ETA updates

### For Student Drivers

1. **Sign Up** - Complete driver registration with:
   - All student requirements
   - Driver's license number
   - Vehicle information
   - License plate

2. **Verification** - Admin verifies student status + driver credentials

3. **Login** - Use role "Student Driver"

4. **Accept Rides** - Dashboard shows nearby ride requests

### For Admins

1. **Login** - Use admin credentials
2. **Verify Students** - Review student ID documents
3. **Approve Drivers** - Check driver licenses and vehicle registration
4. **Monitor Platform** - Ensure safety and compliance

## Pages

### 1. Landing Page (`index.html`)
- Student-focused messaging
- Features: verification, tracking, chat, campus routes
- Statistics and testimonials
- Call-to-action for signup

### 2. Login Page (`login.html`)
- **Role Selection**: Student, Driver, or Admin
- **Fields**: Username, University Email, Password
- **Validation**: .edu email required for students/drivers
- **Redirects**: Role-based dashboard routing

### 3. Signup Page (`signup.html`)
- Account type selection (Student/Driver)
- University email validation
- Student ID collection
- Driver-specific fields (conditional)
- Pending admin verification notice

### 4. Student Dashboard (`student-dashboard.html`)
- **Left Panel**: Ride request form
  - Pickup location
  - Destination selector
  - Passenger count
  - Request/Cancel buttons
  
- **Center Panel**: Interactive Map
  - Student location marker 
  - Driver location marker 
  - Route visualization
  - Real-time updates
  
- **Right Panel**: Live Chat
  - Message history
  - Typing indicators
  - Send messages
  - Driver info display

## Real-Time Features

### Socket.io Events

#### Client → Server
- `requestRide` - Student requests a ride
- `cancelRide` - Student cancels request
- `chatMessage` - Send message to driver
- `driverAvailable` - Driver goes online
- `acceptRide` - Driver accepts ride request

#### Server → Client
- `driverMatched` - Driver found and matched
- `driverLocationUpdate` - Driver's GPS coordinates
- `chatMessage` - Message from driver
- `driverTyping` - Driver is typing
- `rideCompleted` - Ride finished
- `rideCancelled` - Ride was cancelled

### Map Integration (Leaflet.js)
- OpenStreetMap tiles
- Custom markers (student, driver)
- Polyline route visualization
- Auto-centering and zoom
- Real-time position updates

## Technologies

### Frontend
- **HTML5** - Semantic markup
- **CSS3** - Modern styling, gradients, animations
- **JavaScript (ES6+)** - Interactive functionality
- **Leaflet.js** - Interactive maps
- **Socket.io Client** - Real-time communication

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Socket.io** - WebSocket communication
- **HTTP Server** - Serve static files

### External APIs
- **OpenStreetMap** - Map tiles and routing
- **Geolocation API** - User location

## Security

### Authentication
- University email verification (.edu required)
- Password hashing (implement bcrypt in production)
- Session management
- Role-based access control

### Student Verification
- Admin manual review of student IDs
- Email verification required
- Driver background checks
- Vehicle registration validation

### Data Protection
- HTTPS recommended for production
- Secure WebSocket connections (WSS)
- Input validation and sanitization
- Rate limiting on API endpoints

### Safety Features
- Real-time location sharing
- In-app messaging (no phone numbers shared)
- Driver ratings and reviews
- Emergency contact options
- Trip history and receipts

## Design

### Color Palette
- **Primary Blues**: `#1e40af`, `#2563eb`, `#3b82f6`
- **Light Accents**: `#60a5fa`, `#dbeafe`, `#eff6ff`
- **White**: `#ffffff`
- **Text**: `#1e3a8a`, `#475569`, `#64748b`

### Responsive Design
- Desktop: 3-column layout (form | map | chat)
- Tablet: 2-column layout
- Mobile: Stacked layout

## To-Do List

- [x] Landing page with student focus
- [x] Login with role selection
- [x] Signup with student verification
- [x] Student dashboard with ride request
- [x] Real-time map tracking
- [x] Live chat with Socket.io
- [ ] Driver dashboard
- [ ] Admin verification panel
- [ ] Database integration (MongoDB/PostgreSQL)
- [ ] Payment gateway integration
- [ ] Push notifications
- [ ] Rating and review system
- [ ] Ride history
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)

## Deployment

### Environment Variables
Create a `.env` file:
```
PORT=3000
NODE_ENV=production
DATABASE_URL=your_database_url
SESSION_SECRET=your_secret_key
```

### Production Checklist
- [ ] Set up SSL/TLS certificates (HTTPS)
- [ ] Configure database
- [ ] Implement authentication (JWT/sessions)
- [ ] Add password hashing (bcrypt)
- [ ] Set up email service (verification emails)
- [ ] Configure file uploads (student IDs, licenses)
- [ ] Add logging (Winston/Morgan)
- [ ] Set up monitoring (PM2)
- [ ] Implement rate limiting
- [ ] Add error handling middleware

## Contact

- **Project**: Amam Student Ride Sharing
- **Support**: support@amam-student.edu (example)

## License

MIT License - See LICENSE file for details

## Acknowledgments

- OpenStreetMap for map tiles
- Socket.io for real-time communication
- Leaflet.js for interactive maps
- Student safety and community first

---



© 2025 Amam Student. Verified students only. Making campus commutes better.

## Features

### Landing Page (index.html)
- **Responsive Navigation Bar** - Fixed header with smooth blur effect
- **Hero Section** - Eye-catching headline with animated phone mockup
- **Features Grid** - Showcase 6 key platform features
- **How It Works** - Step-by-step user guide
- **Statistics Section** - Display impressive company metrics
- **Call-to-Action** - Download buttons for mobile apps
- **Comprehensive Footer** - Company info and links

### Login Page (login.html)
- **Secure Login Form** - Email and password authentication
- **Password Toggle** - Show/hide password functionality
- **Remember Me** - Session persistence option
- **Social Login** - Google, Facebook, and Apple integration
- **Forgot Password** - Account recovery link
- **Responsive Design** - Works on all device sizes
- **Form Validation** - Client-side input validation
- **Error Handling** - User-friendly error messages

## Project Structure

```
project/
├── public/
│   ├── index.html          # Main landing page
│   └── login.html          # Login/authentication page
├── server.js               # Node.js server file
└── README.md              # Project documentation
```

## Installation

### Prerequisites
- Node.js (v12 or higher)
- npm (Node Package Manager)

### Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   node server.js
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

## Usage

### Development
- The main landing page is accessible at the root URL
- Login page is accessible via the "Login" button in navigation or at `/login.html`
- All pages are fully responsive and work on mobile, tablet, and desktop

### Customization
- **Colors**: Modify the CSS gradient values in the `<style>` sections
- **Content**: Update text directly in the HTML files
- **Images**: Replace emoji icons with actual images or SVG files
- **Functionality**: Extend JavaScript in the `<script>` sections

## Pages

### 1. Landing Page (`index.html`)
The main homepage featuring:
- Animated hero section with phone mockup
- Feature cards highlighting platform benefits
- Step-by-step how-it-works guide
- Statistics showcasing platform success
- Download CTAs for iOS and Android
- Comprehensive footer with links

**Sections:**
- Navigation
- Hero
- Features
- How It Works
- Statistics
- Final CTA
- Footer

### 2. Login Page (`login.html`)
Secure authentication page featuring:
- Email/password login form
- Password visibility toggle
- Remember me checkbox
- Forgot password link
- Social login buttons (Google, Facebook, Apple)
- Sign up redirect link
- Back to home navigation

**Interactive Elements:**
- Password show/hide toggle
- Form validation
- Error message animations
- Input focus effects
- Demo login functionality

## Design

### Color Palette
- **Primary Blue**: `#1e40af`, `#2563eb`, `#3b82f6`
- **Light Blue**: `#60a5fa`, `#dbeafe`, `#eff6ff`
- **White**: `#ffffff`
- **Text**: `#1e3a8a`, `#475569`, `#64748b`

### Typography
- **Font Family**: Segoe UI, Tahoma, Geneva, Verdana, sans-serif
- **Headings**: Bold, large sizes (2rem - 4rem)
- **Body Text**: Regular weight, 1rem - 1.3rem

### Animations
- Floating elements
- Smooth hover transitions
- Slide-up page entrance
- Shake error messages
- Scale transformations

### Responsive Breakpoints
- **Desktop**: > 768px
- **Tablet/Mobile**: ≤ 768px

## Technologies

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with gradients, animations, and flexbox/grid
- **JavaScript (ES6+)** - Interactive functionality
- **Node.js** - Server (if applicable)
- **No external frameworks** - Pure vanilla code for lightweight performance

## Features Breakdown

### Security Features
- Password masking/unmasking
- Form validation
- HTTPS ready (when deployed)

### Performance
- Lightweight (no heavy frameworks)
- Optimized animations
- Fast load times
- Minimal dependencies

### Accessibility
- Semantic HTML
- Proper form labels
- Keyboard navigation support
- Screen reader friendly

### User Experience
- Smooth animations
- Clear call-to-actions
- Intuitive navigation
- Mobile-first responsive design
- Visual feedback on interactions

## Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)



Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Coding Standards
- Use semantic HTML
- Follow CSS BEM methodology where possible
- Write clean, commented JavaScript
- Ensure responsive design
- Test on multiple browsers

## To-Do List

- [ ] Add backend authentication API
- [ ] Implement actual social login integration
- [ ] Create sign-up page
- [ ] Add password recovery flow
- [ ] Implement user dashboard
- [ ] Add ride booking functionality
- [ ] Create driver portal
- [ ] Add real-time ride tracking
- [ ] Implement payment gateway
- [ ] Add admin panel

## Contact

For questions or feedback, please reach out:

- **Project**: Amam Ride Sharing
- **Email**: support@amam.com (example)
- **Website**: [www.amam.com](https://www.amam.com) (example)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


- Design inspiration from modern ride-sharing apps
- Icons: Emoji-based for simplicity
- Color scheme: Modern blue gradients for trust and professionalism

---



© 2025 Amam. All rights reserved. Making every journey count.
