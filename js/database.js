// Supabase Integration for Enzo Dialer Time Sheet
// Requires Supabase project set up via Vercel integration
// Environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
import { createClient } from '@supabase/supabase-js';

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase environment variables missing');
  showToast('Supabase configuration error. Please check environment variables.');
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Timeout helper for async requests
const timeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms))
  ]);
};

// Global variables for compatibility with drive.js and timesheet.js
let currentUser = null; // Supabase user ID (UUID)
let users = {}; // In-memory cache, populated from Supabase

// Register a new user
async function registerUser(email, password, employeeName, employeeRole, hourlyRate, bonus) {
  showLoading();
  try {
    // Test Supabase connection
    const { error: testError } = await timeout(supabase.auth.getSession(), 5000);
    if (testError) {
      console.error('Supabase connection test failed:', testError);
      showToast(`Supabase connection failed: ${testError.message}`);
      hideLoading();
      return false;
    }

    const { data, error } = await timeout(
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: { employee_name: employeeName, employee_role: employeeRole }
        }
      }),
      5000 // 5-second timeout
    );
    if (error) {
      console.error('Registration error:', error);
      showToast(`Registration failed: ${error.message}`);
      hideLoading();
      return false;
    }
    const user = data.user;
    if (user) {
      // Insert profile data
      const { error: profileError } = await timeout(
        supabase
          .from('profiles')
          .insert({
            id: user.id,
            employee_name: employeeName,
            employee_role: employeeRole,
            hourly_rate: parseFloat(hourlyRate) || 0,
            bonus: parseFloat(bonus) || 0
          }),
        5000
      );
      if (profileError) {
        console.error('Profile creation error:', profileError);
        showToast(`Failed to create profile: ${profileError.message}`);
        hideLoading();
        return false;
      }
      currentUser = user.id;
      users[currentUser] = {
        data: [], // Initialize empty time sheet data
        profile: { employee_name: employeeName, employee_role: employeeRole, hourly_rate: hourlyRate, bonus: bonus }
      };
      showToast('Registration successful! You are now logged in.');
      await loadUserData();
      hideLoading();
      return true;
    }
    showToast('Registration failed: No user data returned.');
    hideLoading();
    return false;
  } catch (err) {
    console.error('Unexpected registration error:', err);
    showToast(`Unexpected error during registration: ${err.message}`);
    hideLoading();
    return false;
  }
}

// Login user
async function loginUser(email, password) {
  showLoading();
  try {
    // Test Supabase connection
    const { error: testError } = await timeout(supabase.auth.getSession(), 5000);
    if (testError) {
      console.error('Supabase connection test failed:', testError);
      showToast(`Supabase connection failed: ${testError.message}`);
      hideLoading();
      return false;
    }

    const { data, error } = await timeout(
      supabase.auth.signInWithPassword({
        email,
        password
      }),
      5000 // 5-second timeout
    );
    if (error) {
      console.error('Login error:', error);
      showToast(`Login failed: ${error.message}`);
      hideLoading();
      return false;
    }
    const user = data.user;
    if (user) {
      currentUser = user.id;
      await loadUserProfile();
      await loadPaymentData();
      showToast('Login successful!');
      await loadUserData();
      hideLoading();
      return true;
    }
    showToast('Login failed: No user data returned.');
    hideLoading();
    return false;
  } catch (err) {
    console.error('Unexpected login error:', err);
    showToast(`Unexpected error during login: ${err.message}`);
    hideLoading();
    return false;
  }
}

// Logout user
async function logoutUser() {
  showLoading();
  try {
    const { error } = await timeout(supabase.auth.signOut(), 5000);
    if (error) {
      console.error('Logout error:', error);
      showToast(`Logout failed: ${error.message}`);
      hideLoading();
      return false;
    }
    currentUser = null;
    users = {};
    showToast('Logged out successfully.');
    await loadUserData();
    hideLoading();
    return true;
  } catch (err) {
    console.error('Unexpected logout error:', err);
    showToast(`Unexpected error during logout: ${err.message}`);
    hideLoading();
    return false;
  }
}

// Load user profile from Supabase
async function loadUserProfile() {
  if (!currentUser) return;
  try {
    const { data, error } = await timeout(
      supabase
        .from('profiles')
        .select('employee_name, employee_role, hourly_rate, bonus')
        .eq('id', currentUser)
        .single(),
      5000
    );
    if (error) {
      console.error('Profile load error:', error);
      showToast(`Failed to load profile: ${error.message}`);
      return;
    }
    if (data) {
      users[currentUser] = users[currentUser] || {};
      users[currentUser].profile = {
        employee_name: data.employee_name,
        employee_role: data.employee_role,
        hourly_rate: data.hourly_rate,
        bonus: data.bonus
      };
    }
  } catch (err) {
    console.error('Unexpected profile load error:', err);
    showToast(`Unexpected error loading profile: ${err.message}`);
  }
}

// Save payment data to Supabase
async function savePaymentData(paymentData) {
  if (!currentUser) {
    showToast('Please login to save payment data.');
    return false;
  }
  try {
    const { error } = await timeout(
      supabase
        .from('payment_data')
        .insert({
          user_id: currentUser,
          payment_data: paymentData
        }),
      5000
    );
    if (error) {
      console.error('Payment data save error:', error);
      showToast(`Failed to save payment data: ${error.message}`);
      return false;
    }
    users[currentUser] = users[currentUser] || {};
    users[currentUser].data = paymentData;
    showToast('Payment data saved successfully.');
    return true;
  } catch (err) {
    console.error('Unexpected payment data save error:', err);
    showToast(`Unexpected error saving payment data: ${err.message}`);
    return false;
  }
}

// Load payment data from Supabase
async function loadPaymentData() {
  if (!currentUser) return;
  try {
    const { data, error } = await timeout(
      supabase
        .from('payment_data')
        .select('payment_data')
        .eq('user_id', currentUser)
        .single(),
      5000
    );
    if (error) {
      console.error('Payment data load error:', error);
      showToast(`Failed to load payment data: ${error.message}`);
      return;
    }
    if (data) {
      users[currentUser] = users[currentUser] || {};
      users[currentUser].data = data.payment_data;
      await loadUserData();
    }
  } catch (err) {
    console.error('Unexpected payment data load error:', err);
    showToast(`Unexpected error loading payment data: ${err.message}`);
  }
}

// Update user profile
async function updateUserProfile(employeeName, employeeRole, hourlyRate, bonus) {
  if (!currentUser) {
    showToast('Please login to update profile.');
    return false;
  }
  try {
    const { error } = await timeout(
      supabase
        .from('profiles')
        .update({
          employee_name: employeeName,
          employee_role: employeeRole,
          hourly_rate: parseFloat(hourlyRate) || 0,
          bonus: parseFloat(bonus) || 0
        })
        .eq('id', currentUser),
      5000
    );
    if (error) {
      console.error('Profile update error:', error);
      showToast(`Failed to update profile: ${error.message}`);
      return false;
    }
    users[currentUser].profile = {
      employee_name: employeeName,
      employee_role: employeeRole,
      hourly_rate: hourlyRate,
      bonus: bonus
    };
    showToast('Profile updated successfully.');
    return true;
  } catch (err) {
    console.error('Unexpected profile update error:', err);
    showToast(`Unexpected error updating profile: ${err.message}`);
    return false;
  }
}

// Initialize Supabase auth state
async function initSupabase() {
  try {
    const { data: { session } } = await timeout(supabase.auth.getSession(), 5000);
    if (session) {
      currentUser = session.user.id;
      await loadUserProfile();
      await loadPaymentData();
    }
  } catch (err) {
    console.error('Supabase initialization error:', err);
    showToast('Failed to initialize Supabase.');
  }
}

// Listen for auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  try {
    if (event === 'SIGNED_IN') {
      currentUser = session.user.id;
      await loadUserProfile();
      await loadPaymentData();
      showToast('Signed in successfully.');
      await loadUserData();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      users = {};
      showToast('Signed out successfully.');
      await loadUserData();
    }
  } catch (err) {
    console.error('Auth state change error:', err);
    showToast(`Error handling auth state: ${err.message}`);
  }
});

// Export functions for use in other scripts
export {
  registerUser,
  loginUser,
  logoutUser,
  savePaymentData,
  loadPaymentData,
  updateUserProfile,
  initSupabase
};