/**
 * College Lab Registration System - Configuration
 * PSG Institute of Technology and Applied Research
 * 
 * PRODUCTION SETUP
 */

// ============================================
// CONFIGURATION - COLLEGE NETWORK
// ============================================

const ADMIN_SERVER_IP = "10.10.46.182";  // ✅ Admin System IP (psgitech.edu)
const ADMIN_SERVER_PORT = 8000;

// ============================================
// DO NOT MODIFY BELOW THIS LINE
// ============================================

const SERVER_URL = `http://${ADMIN_SERVER_IP}:${ADMIN_SERVER_PORT}`;

module.exports = {
    SERVER_URL,
    ADMIN_SERVER_IP,
    ADMIN_SERVER_PORT,
    
    // Lab Configuration
    LAB_ID: "LAB-01",  // Change per lab if multiple labs
    
    // Connection Settings
    RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 2000, // milliseconds
    
    // Display Settings
    SHOW_DEV_TOOLS: true,  // Set to false for production
    FULL_SCREEN: false,     // Set to true for production
    ENABLE_KEYBOARD_SHORTCUTS: true // Set to false for production (blocks Alt+F4, etc.)
};
