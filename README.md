# SOJ Backend (Express.js + MongoDB)

This repository contains a complete Express + MongoDB backend built to match the app-flow of the **Streams of Joy Umuahia** React Native UI you provided.

## Key point
This backend uses **Firebase Authentication (phone SMS)** **only** for sending and verifying OTPs. No Firebase Realtime Database or Storage is used — all app data (users, messages, attendance, events, files) are stored in MongoDB and Cloudinary.

## What is included
- Authentication with Firebase phone SMS (client handles sending SMS & entering OTP; backend verifies Firebase ID tokens)
- Role-aware users (SuperAdmin, UnitLeader, Member) — users can have multiple roles
- Units management (units, leaders, members)
- Access Code generation (expires after 6 hours, single-use)
- Messaging with MongoDB persistence + Socket.IO real-time delivery
- Attendance, Events, Announcements, and basic reporting endpoints
- Cloudinary for profile images
- README and `.env.example`

## Setup (local)
1. Make sure you have Node.js and MongoDB installed locally.
2. Copy `.env.example` to `.env` and edit variables (Firebase and Cloudinary).
3. Install dependencies:
   ```bash
   npm install
   ```
4. (Optional) Seed a Super Admin:
   ```bash
   npm run seed:admin
   ```
5. Start the server:
   ```bash
   npm run dev
   ```
   The API will run on `http://localhost:4000`

## Auth flow (Firebase SMS)
- Client sends phone to Firebase SDK which sends SMS.
- Client confirms OTP and obtains Firebase ID token.
- Client POSTs `{ firebaseToken }` to `/api/auth/verify`.
- Backend verifies token with Firebase Admin SDK, extracts phone number, finds the user in MongoDB, marks `isVerified`, and returns a backend JWT + user object.

## Messaging (real-time)
- Connect to Socket.IO server and emit `register` with `{ userId }`.
- Server broadcasts `onlineUsers` and delivers messages in real-time if recipient is online; messages are also stored in MongoDB.
- REST endpoints exist to send messages and fetch conversation history.

## .env variables
See `.env.example` for all required keys (Firebase service account fields, Cloudinary keys, MongoDB URI, JWT secret).

## File map
- `src/` - application source
  - `models/` - Mongoose models
  - `routes/` - Express route definitions
  - `controllers/` - route handlers
  - `middleware/` - auth and role middlewares
  - `utils/` - helpers (phone normalization)
- `scripts/seedAdmin.js` - add a default Super Admin
- `.env.example` - environment vars example

Download the backend ZIP included in this workspace and follow setup steps above.


## Additional features added
- Announcements
- Testimonies (submit and list)
- Souls Won
- Finance (income/expense) recording
- Shop / Emporium items and sales

These endpoints are mounted under `/api/announcements`, `/api/testimonies`, `/api/souls`, `/api/finance`, `/api/shop`.
