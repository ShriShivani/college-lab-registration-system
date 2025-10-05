/**
 * Student First-Time Signin System
 */

// Configuration
const ADMIN_SERVER_IP = "10.10.46.182"; // ⬅️ YOUR IP ADDRESS
const SERVER_URL = `http://${ADMIN_SERVER_IP}:8000`;

// DOM Elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const verifyForm = document.getElementById('verifyForm');
const signinForm = document.getElementById('signinForm');
const statusMessage = document.getElementById('statusMessage');
const studentInfo = document.getElementById('studentInfo');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 Student First-Time Signin System Loaded');
    console.log('📡 Server URL:', SERVER_URL);
    initializeEvents();
    checkServerConnection();
});

// Initialize Event Listeners
function initializeEvents() {
    // Step 1: Verify student ID
    verifyForm.addEventListener('submit', handleStudentVerification);
    
    // Step 2: Complete signin
    signinForm.addEventListener('submit', handleSigninSubmit);
    
    // Password validation
    passwordInput.addEventListener('input', checkPasswordStrength);
    confirmPasswordInput.addEventListener('input', checkPasswordMatch);
    
    // Auto-uppercase student ID
    document.getElementById('studentIdCheck').addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });
}

// Step 1: Handle Student ID Verification
async function handleStudentVerification(event) {
    event.preventDefault();
    
    const studentId = document.getElementById('studentIdCheck').value.trim();
    
    if (!studentId) {
        showStatusMessage('Please enter your Student ID', 'danger');
        return;
    }
    
    setLoadingState('verify', true);
    
    try {
        const response = await fetch(`${SERVER_URL}/api/check-student-eligibility`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId })
        });
        
        const result = await response.json();
        
        if (result.eligible) {
            console.log('✅ Student verified:', result);
            showStep2(studentId, result);
            hideStatusMessage();
        } else {
            console.log('❌ Student not eligible:', result.reason);
            showStatusMessage(result.reason, 'danger');
        }
        
    } catch (error) {
        console.error('❌ Verification error:', error);
        showStatusMessage('Network error. Please check server connection.', 'danger');
    } finally {
        setLoadingState('verify', false);
    }
}

// Show Step 2 with Student Info
function showStep2(studentId, studentData) {
    document.getElementById('verifiedStudentId').value = studentId;
    
    studentInfo.innerHTML = `
        <i class="fas fa-user-check"></i>
        <strong>Student Found:</strong> ${studentData.studentName}<br>
        <strong>Department:</strong> ${studentData.department}<br>
        <strong>Student ID:</strong> ${studentId}
    `;
    
    step1.style.display = 'none';
    step2.style.display = 'block';
}

// Step 2: Handle Complete Signin
async function handleSigninSubmit(event) {
    event.preventDefault();
    
    if (!validateSigninForm()) {
        return;
    }
    
    setLoadingState('signin', true);
    
    const formData = {
        name: document.getElementById('fullName').value.trim(),
        studentId: document.getElementById('verifiedStudentId').value,
        dateOfBirth: document.getElementById('dateOfBirth').value,
        password: document.getElementById('password').value
    };
    
    console.log('📝 Submitting signin:', { ...formData, password: '[HIDDEN]' });
    
    try {
        const response = await fetch(`${SERVER_URL}/api/student-first-signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Signin successful');
            showSuccessModal(result.student);
            hideStatusMessage();
        } else {
            console.error('❌ Signin failed:', result.error);
            showStatusMessage(result.error, 'danger');
        }
        
    } catch (error) {
        console.error('❌ Network error:', error);
        showStatusMessage('Network error. Please try again.', 'danger');
    } finally {
        setLoadingState('signin', false);
    }
}

// Password Strength Checker
function checkPasswordStrength() {
    const password = passwordInput.value;
    const strengthElement = document.getElementById('passwordStrength');
    
    if (password.length === 0) {
        strengthElement.textContent = '';
        return;
    }
    
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[!@#$%^&*]/.test(password)) strength++;
    
    if (strength < 2) {
        strengthElement.textContent = '🔴 Weak password';
        strengthElement.className = 'password-strength password-weak';
    } else if (strength < 4) {
        strengthElement.textContent = '🟡 Medium strength';
        strengthElement.className = 'password-strength password-medium';
    } else {
        strengthElement.textContent = '🟢 Strong password';
        strengthElement.className = 'password-strength password-strong';
    }
    
    checkPasswordMatch();
}

// Password Match Checker
function checkPasswordMatch() {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const matchElement = document.getElementById('passwordMatch');
    
    if (confirmPassword.length === 0) {
        matchElement.textContent = '';
        matchElement.className = 'form-text';
        return;
    }
    
    if (password === confirmPassword) {
        matchElement.textContent = '✅ Passwords match';
        matchElement.className = 'form-text match';
        confirmPasswordInput.classList.remove('is-invalid');
        confirmPasswordInput.classList.add('is-valid');
    } else {
        matchElement.textContent = '❌ Passwords do not match';
        matchElement.className = 'form-text no-match';
        confirmPasswordInput.classList.remove('is-valid');
        confirmPasswordInput.classList.add('is-invalid');
    }
}

// Toggle Password Visibility
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const icon = field.nextElementSibling;
    
    if (field.type === 'password') {
        field.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        field.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Validate Signin Form
function validateSigninForm() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const name = document.getElementById('fullName').value.trim();
    const dob = document.getElementById('dateOfBirth').value;
    const agree = document.getElementById('agreeTerms').checked;
    
    if (!name) {
        showStatusMessage('Please enter your full name', 'danger');
        return false;
    }
    
    if (!dob) {
        showStatusMessage('Please select your date of birth', 'danger');
        return false;
    }
    
    if (password.length < 6) {
        showStatusMessage('Password must be at least 6 characters', 'danger');
        return false;
    }
    
    if (password !== confirmPassword) {
        showStatusMessage('Passwords do not match', 'danger');
        return false;
    }
    
    if (!agree) {
        showStatusMessage('Please accept the terms', 'danger');
        return false;
    }
    
    return true;
}

// Loading States
function setLoadingState(type, loading) {
    const btn = document.getElementById(type + 'Btn');
    const text = document.getElementById(type + 'Text');
    const spinner = document.getElementById(type + 'Spinner');
    
    btn.disabled = loading;
    
    if (loading) {
        btn.classList.add('loading');
        text.style.opacity = '0';
        spinner.classList.remove('d-none');
    } else {
        btn.classList.remove('loading');
        text.style.opacity = '1';
        spinner.classList.add('d-none');
    }
}

// Status Messages
function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `alert alert-${type}`;
    statusMessage.style.display = 'block';
    statusMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(hideStatusMessage, 5000);
    }
}

function hideStatusMessage() {
    statusMessage.style.display = 'none';
}

// Success Modal
function showSuccessModal(student) {
    const dob = document.getElementById('dateOfBirth').value;
    const dobFormatted = new Date(dob).toLocaleDateString('en-GB'); // DD/MM/YYYY format
    
    document.getElementById('successDetails').innerHTML = `
        <div class="alert alert-success">
            <strong>Student:</strong> ${student.name}<br>
            <strong>Student ID:</strong> ${student.studentId}<br>
            <strong>Department:</strong> ${student.department}<br>
            <strong>Lab:</strong> ${student.labId}
        </div>
        <p><strong>Password Reset Code:</strong> ${dobFormatted}</p>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('successModal'));
    modal.show();
}

// Reset to Step 1
function resetForm() {
    step2.style.display = 'none';
    step1.style.display = 'block';
    verifyForm.reset();
    signinForm.reset();
    hideStatusMessage();
    
    // Clear validation
    document.querySelectorAll('.form-control').forEach(field => {
        field.classList.remove('is-valid', 'is-invalid');
    });
    
    document.getElementById('passwordStrength').textContent = '';
    document.getElementById('passwordMatch').textContent = '';
}

// Show Kiosk Info
function showKioskInfo() {
    alert(`🖥️ To Login at Lab Computer:

1. Go to any college lab computer
2. Open the kiosk application
3. Enter your Student ID and Password
4. If you forgot password, use your Date of Birth

Note: You must complete first-time signin before using lab computers.`);
}

// Check Server Connection
async function checkServerConnection() {
    try {
        const response = await fetch(`${SERVER_URL}/api/active-sessions/all`);
        if (response.ok) {
            console.log('✅ Server connection successful');
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        console.warn('⚠️ Server connection issue:', error.message);
        showStatusMessage('Warning: Cannot connect to server. Please check if the server is running.', 'warning');
    }
}
