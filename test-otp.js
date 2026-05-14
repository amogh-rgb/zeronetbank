#!/usr/bin/env node

// Simple OTP test script
const { OTPService } = require('./dist/services/otpService');
const { EmailService } = require('./dist/services/emailService');
const { DatabaseService } = require('./dist/services/databaseService');

async function testOTPSystem() {
  console.log('🧪 Starting OTP System Test...\n');

  try {
    // Initialize database
    console.log('1. Initializing database...');
    await DatabaseService.initialize();
    console.log('✅ Database initialized\n');

    // Initialize email service
    console.log('2. Initializing email service...');
    const emailService = EmailService.getInstance();
    console.log('✅ Email service initialized\n');

    // Test OTP generation and sending
    console.log('3. Testing OTP generation and sending...');
    const testEmail = 'test@example.com';
    const otpResult = await OTPService.sendOTP(testEmail);
    
    console.log('OTP Send Result:', otpResult);
    
    if (otpResult.success) {
      console.log('✅ OTP sent successfully\n');
      
      // Test OTP verification (simulating user entering wrong OTP first)
      console.log('4. Testing OTP verification with wrong code...');
      const wrongResult = await OTPService.verifyOTPCode(testEmail, '123456');
      console.log('Wrong OTP Result:', wrongResult);
      
      // Test OTP verification with correct code (we need to get the actual OTP)
      console.log('5. Testing OTP verification...');
      // Note: In a real test, you'd need to get the actual OTP from the email
      // For now, we'll just show the verification process
      console.log('📧 Check your email for the OTP code');
      console.log('Enter the OTP code to test verification...');
      
    } else {
      console.log('❌ OTP sending failed\n');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up
    await DatabaseService.close();
    console.log('\n🏁 Test completed');
  }
}

// Run the test
testOTPSystem().catch(console.error);
