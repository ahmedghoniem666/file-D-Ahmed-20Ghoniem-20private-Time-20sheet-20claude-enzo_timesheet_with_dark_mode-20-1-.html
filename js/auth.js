const supabaseUrl = 'https://xsnvjpbhbxxnpqxlnxyz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbnZqcGJoYnh4bnBxeGxueHl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTgxMTgzNywiZXhwIjoyMDcxMzg3ODM3fQ.I9sWSEqIRKzrsNpwN8R6mEcBE2RW_BZShwSH9vu-phY'; // Replace with the correct anon key from Supabase dashboard
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let isAdminUser = false;

async function timeout(promise, ms, retries = 2) {
    let attempt = 1;
    const tryPromise = () => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
    ]).catch(err => {
        if (attempt < retries && err.message.includes('Timeout')) {
            attempt++;
            return tryPromise();
        }
        throw err;
    });
    return tryPromise();
}

async function loginUser(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    showLoading();
    try {
        console.log('Attempting login with email:', email);
        const { data, error } = await timeout(supabase.auth.signInWithPassword({ email, password }), 5000);
        if (error) {
            console.error('Supabase auth error:', error);
            throw new Error(`Authentication failed: ${error.message}`);
        }
        currentUser = data.user.id;
        localStorage.setItem('currentUser', currentUser);
        console.log('User authenticated, ID:', currentUser);

        // Fetch or create user profile
        let profile;
        const { data: profileData, error: profileErr } = await timeout(
            supabase.from('profiles').select('*').eq('id', currentUser).single(),
            5000
        );
        if (profileErr && profileErr.code === 'PGRST116') {
            // No profile found, create a default one
            console.log('No profile found, creating default profile for user:', currentUser);
            const { data: newProfile, error: insertErr } = await timeout(
                supabase.from('profiles').insert({
                    id: currentUser,
                    employee_name: email.split('@')[0], // Use email prefix as default name
                    employee_role: 'Employee',
                    hourly_rate: 0,
                    bonus: 0,
                    is_admin: email === 'admin@enzopay.com' // Set admin for known admin email
                }).select().single(),
                5000
            );
            if (insertErr) {
                console.error('Profile creation error:', insertErr);
                throw new Error(`Profile creation failed: ${insertErr.message}`);
            }
            profile = newProfile;
            console.log('Profile created:', profile);
        } else if (profileErr) {
            console.error('Profile fetch error:', profileErr);
            throw new Error(`Profile fetch failed: ${profileErr.message}`);
        } else {
            profile = profileData;
            console.log('Profile fetched:', profile);
        }

        isAdminUser = profile.is_admin || false;
        console.log('Admin status:', isAdminUser);
        if (isAdminUser) {
            
            showAdminPanel();
        } else {
            showUserInterface();
        }
        await updateLastLogin();
        showToast('Login successful!');
    } catch (err) {
        showToast(`Login failed: ${err.message}`);
        console.error('Login error details:', err);
    } finally {
        hideLoading();
    }
}

async function logoutUser() {
    showLoading();
    try {
        const { error } = await timeout(supabase.auth.signOut(), 5000);
        if (error) throw error;
        currentUser = null;
        isAdminUser = false;
        localStorage.removeItem('currentUser');
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('userInterface').classList.add('hidden');
        document.getElementById('adminPanel').classList.add('hidden');
        showToast('Logged out successfully.');
    } catch (err) {
        showToast('Logout failed: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function updateLastLogin() {
    if (!currentUser) return;
    try {
        showLoading();
        const { error } = await timeout(
            supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', currentUser),
            5000
        );
        if (error) throw error;
        console.log('Last login updated for user:', currentUser);
    } catch (err) {
        showToast('Failed to update last login: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function saveUser(e) {
    e.preventDefault();    
    // Check admin privileges
    const isAdmin = await validateAdminAccess();
    if (!isAdmin) {
        showToast('Administrator privileges required');
        return;
    }
    const newEmail = document.getElementById('newEmail').value;
    const newPassword = document.getElementById('newPassword').value;
    const newEmployeeName = document.getElementById('newEmployeeName').value;
    const newEmployeeRole = document.getElementById('newEmployeeRole').value;
    const newHourlyRate = parseFloat(document.getElementById('newHourlyRate').value) || 0;
    const newBonus = parseFloat(document.getElementById('newBonus').value) || 0;
    
    showLoading();
    try {
        // First create the auth user
        const { data: authData, error: authErr } = await timeout(
            supabase.auth.admin.createUser({
                email: newEmail,
                password: newPassword,
                email_confirm: true
            }),
            5000
        );
        
        if (authErr) throw authErr;
        const userId = authData.user.id;
        
        // Then create the profile
        const { error: profileErr } = await timeout(
            supabase.from('profiles').insert({
                id: userId,
                employee_name: newEmployeeName,
                employee_role: newEmployeeRole,
                hourly_rate: newHourlyRate,
                bonus: newBonus,
                is_admin: false
            }),
            5000
        );
        
        if (profileErr) throw profileErr;
        showToast('User added successfully');
        e.target.reset();
        renderUserList();
        updateAdminStats();
    } catch (err) {
        showToast('Add user failed: ' + err.message);
        console.error('Add user error:', err);
    } finally {
        hideLoading();
    }
}

async function deleteUser(id) {
    const modal = document.getElementById('confirmModal');
    const message = document.getElementById('confirmMessage');
    
    message.textContent = 'Are you sure you want to delete this user? This action cannot be undone.';
    modal.style.display = 'flex';
    
    document.getElementById('confirmAction').onclick = async () => {
        showLoading();
        try {
            // Get user info before deletion for logging
            const { data: userData } = await supabase
                .from('profiles')
                .select('employee_name, email')
                .eq('id', id)
                .single();
            
            // Delete the user from auth
            const { error: authError } = await supabase.auth.admin.deleteUser(id);
            if (authError) throw authError;
            
            // Delete from profiles
            const { error: profileError } = await supabase.from('profiles').delete().eq('id', id);
            if (profileError) throw profileError;
            
            // Log the action
            await logAdminAction('delete_user', id, {
                user_email: userData?.email,
                user_name: userData?.employee_name
            });
            
            renderUserList();
            updateAdminStats();
            showToast('User deleted successfully');
        } catch (err) {
            showToast('Delete failed: ' + err.message);
            console.error('Delete user error:', err);
        } finally {
            modal.style.display = 'none';
            hideLoading();
        }
    };
}

async function toggleAdminStatus(userId, makeAdmin) {
    try {
        showLoading();
        
        // Get user info for logging
        const { data: userData } = await supabase
            .from('profiles')
            .select('employee_name, email, is_admin')
            .eq('id', userId)
            .single();
        
        // Don't allow users to demote themselves
        if (userId === currentUser && !makeAdmin) {
            showToast('You cannot remove your own admin privileges');
            return;
        }
        
        const { error } = await supabase
            .from('profiles')
            .update({ is_admin: makeAdmin })
            .eq('id', userId);
        
        if (error) throw error;
        
        // Log the action
        await logAdminAction(makeAdmin ? 'grant_admin' : 'revoke_admin', userId, {
            user_email: userData?.email,
            user_name: userData?.employee_name,
            previous_status: userData?.is_admin
        });
        
        showToast(`User ${makeAdmin ? 'promoted to admin' : 'demoted from admin'} successfully!`);
        renderUserList();
    } catch (err) {
        showToast('Failed to update admin status: ' + err.message);
        console.error('Toggle admin status error:', err);
    } finally {
        hideLoading();
    }
}

// Enhanced admin stats
async function updateAdminStats() {
    try {
        showLoading();

        const stats = {
            totalEmployees: 0,
            totalAdmins: 0,
            pendingPayslips: 0,
            paidPayslips: 0,
            totalPayroll: 0,
            recentActivity: []
        };

        // Get total employees count
        const { count: totalCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact' });
        
        // Get admin count
        const { count: adminCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact' })
            .eq('is_admin', true);
        
        stats.totalEmployees = totalCount || 0;
        stats.totalAdmins = adminCount || 0;

        // Get pending payslips count
        const { count: pendingCount } = await supabase
            .from('payslips')
            .select('*', { count: 'exact' })
            .eq('status', 'pending');
        
            
        stats.pendingPayslips = pendingCount || 0;

            const { count: paidCount } = await supabase
            .from('payslips')
            .select('*', { count: 'exact' })
            .eq('status', 'paid');
        
            stats.paidPayslips = paidCount || 0;
        // Get total payroll amount
        const { data: payrollData } = await supabase
            .from('payslips')
            .select('payslip_data')
            .eq('status', 'paid');
        
        stats.totalPayroll = payrollData
            .reduce((sum, record) => sum + (record.payslip_data?.totals?.grandTotal || 0), 0)
            .toFixed(2);

        // Get recent activity (simplified)
        const { data: activityData } = await supabase
            .from('payslips')
            .select('employeename, submissiondate')
            .order('submissiondate', { ascending: false })
            .limit(5);
        
        stats.recentActivity = activityData || [];

        // Update UI elements
        const totalEmployeesEl = document.getElementById('totalEmployees');
        const totalAdminsEl = document.getElementById('totalAdmins');
        const pendingPayslipsEl = document.getElementById('pendingPayslips');
        const paidPayslipsEl = document.getElementById('paidPayslips');
        const totalPayrollEl = document.getElementById('totalPayroll');
        const activityListEl = document.getElementById('recentActivity');

        if (totalEmployeesEl) totalEmployeesEl.textContent = stats.totalEmployees;
        if (totalAdminsEl) totalAdminsEl.textContent = stats.totalAdmins;
        if (pendingPayslipsEl) pendingPayslipsEl.textContent = stats.pendingPayslips;
        if (paidPayslipsEl) paidPayslipsEl.textContent = stats.paidPayslips;
        if (totalPayrollEl) totalPayrollEl.textContent = `$${stats.totalPayroll}`;
        if (activityListEl) {
            activityListEl.innerHTML = stats.recentActivity
                .map(activity => `<li>${activity.employeename || 'Unknown'} submitted a payslip on ${new Date(activity.submissiondate).toLocaleDateString()}</li>`)
                .join('');
        }

        showToast('Admin stats updated successfully!');
    } catch (err) {
        console.error('Failed to update admin stats:', err.message);
        showToast('Failed to load admin stats: ' + err.message);
    } finally {
        hideLoading();
    }
}
// Track admin activity
// Track admin action with error handling
async function logAdminAction(actionType, targetUserId, details = {}) {
    try {
        // Check if admin_actions table exists by attempting a simple query
        const { error: checkError } = await supabase
            .from('admin_actions')
            .select('id')
            .limit(1);
        
        // If table doesn't exist, skip logging
        if (checkError && checkError.code === '42P01') { // 42P01 is "table doesn't exist" error code
            console.warn('admin_actions table does not exist. Skipping action logging.');
            return;
        }
        
        const { error } = await supabase
            .from('admin_actions')
            .insert({
                admin_id: currentUser,
                action_type: actionType,
                target_user_id: targetUserId,
                details: { ...details, timestamp: new Date().toISOString() }
            });
        
        if (error) {
            console.error('Failed to log admin action:', error);
            // Don't throw error, just log to console
        }
    } catch (err) {
        console.error('Error logging admin action:', err);
        // Don't break the main functionality if logging fails
    }
}
// Render admin activity log
// Render admin activity log
// Render admin activity log with error handling
async function renderAdminActivityLog() {
    const activityLog = document.getElementById('activityLog');
    if (!activityLog) return;
    
    try {
        showLoading();
        
        // First check if admin_actions table exists
        const { error: checkError } = await supabase
            .from('admin_actions')
            .select('id')
            .limit(1);
        
        if (checkError && (checkError.code === '42P01' || checkError.code === '42703')) {
            // Table doesn't exist
            activityLog.innerHTML = `
                <tr>
                    <td colspan="5">
                        <div style="text-align: center; padding: 20px;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: var(--warning);"></i>
                            <p>Admin actions table not found.</p>
                            <p>Please run the setup SQL to create the admin_actions table.</p>
                            <button class="btn btn-sm" onclick="copySetupSQL()">
                                <i class="fas fa-copy"></i> Copy Setup SQL
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Get the admin actions
        const { data: activities, error } = await supabase
            .from('admin_actions')
            .select('id, action_type, created_at, admin_id, target_user_id, details')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        activityLog.innerHTML = '';
        
        if (!activities || activities.length === 0) {
            activityLog.innerHTML = '<tr><td colspan="5">No admin activities found</td></tr>';
            return;
        }
        
        // Get all unique user IDs from activities
        const userIds = [...new Set([
            ...activities.map(a => a.admin_id),
            ...activities.map(a => a.target_user_id).filter(id => id)
        ])];
        
        // Get user details in a single query
        let userDetails = {};
        if (userIds.length > 0) {
            const { data: users, error: usersError } = await supabase
                .from('profiles')
                .select('id, employee_name')
                .in('id', userIds);
            
            if (!usersError && users) {
                users.forEach(user => {
                    userDetails[user.id] = user.employee_name;
                });
            }
        }
        
        // Render the activities
        activities.forEach(activity => {
            const tr = document.createElement('tr');
            
            const adminName = userDetails[activity.admin_id] || 'Unknown Admin';
            const targetUserName = activity.target_user_id ? 
                (userDetails[activity.target_user_id] || 'Unknown User') : 'N/A';
            
            tr.innerHTML = `
                <td>${adminName}</td>
                <td>${getActionDescription(activity.action_type)}</td>
                <td>${targetUserName}</td>
                <td>${new Date(activity.created_at).toLocaleString()}</td>
                <td title="${JSON.stringify(activity.details || {})}">
                    ${Object.keys(activity.details || {}).length > 0 ? 'View Details' : 'No details'}
                </td>
            `;
            activityLog.appendChild(tr);
        });
    } catch (err) {
        console.error('Failed to load admin activity log:', err);
        activityLog.innerHTML = `
            <tr>
                <td colspan="5">
                    <div style="text-align: center; padding: 20px; color: var(--danger);">
                        <i class="fas fa-exclamation-circle"></i>
                        <p>Failed to load admin activity log: ${err.message}</p>
                    </div>
                </td>
            </tr>
        `;
    } finally {
        hideLoading();
    }
}
function getActionDescription(actionType) {
    const actions = {
        'create_user': 'Created User',
        'delete_user': 'Deleted User',
        'grant_admin': 'Granted Admin Privileges',
        'revoke_admin': 'Revoked Admin Privileges',
        'initiate_password_reset': 'Initiated Password Reset',
        'approve_payslip': 'Approved Payslip',
        'reject_payslip': 'Rejected Payslip',
        'reopen_payslip': 'Reopened Payslip',
        'delete_payslip': 'Deleted Payslip' // Add this line
    };
    return actions[actionType] || actionType;
}


async function renderUserList() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    try {
        showLoading();
        
        // First get profiles data
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, employee_name, employee_role, hourly_rate, is_admin, last_login')
            .order('employee_name');
        
        if (profilesError) throw profilesError;
        
        // Get email addresses from auth.users (admin only)
        let authUsers = [];
        if (isAdminUser) {
            const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
            if (!authError) {
                authUsers = authData.users;
            }
        }
        
        // Combine the data
        const usersWithEmail = profiles.map(profile => {
            const authUser = authUsers.find(user => user.id === profile.id);
            return {
                ...profile,
                email: authUser?.email || 'N/A'
            };
        });
        
        usersWithEmail.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.email}</td>
                <td>${user.employee_name}</td>
                <td>${user.employee_role}</td>
                <td>$${user.hourly_rate.toFixed(2)}</td>
                <td>${user.is_admin ? 'Admin' : 'User'}</td>
                <td>${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        ${!user.is_admin ? 
                            `<button class="btn btn-sm btn-success" onclick="toggleAdminStatus('${user.id}', true)">
                                <i class="fas fa-user-shield"></i> Make Admin
                            </button>` : 
                            `<button class="btn btn-sm btn-warning" onclick="toggleAdminStatus('${user.id}', false)">
                                <i class="fas fa-user"></i> Make User
                            </button>`
                        }
                        <button class="btn btn-sm btn-info" onclick="initiatePasswordReset('${user.id}')">
                            <i class="fas fa-key"></i> Reset Password
                        </button>
                        ${user.id !== currentUser ? 
                            `<button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>` : 
                            `<button class="btn btn-sm btn-danger" disabled title="Cannot delete yourself">
                                <i class="fas fa-trash"></i> Delete
                            </button>`
                        }
                    </div>
                </td>
            `;
            userList.appendChild(tr);
        });
    } catch (err) {
        showToast('Failed to load users: ' + err.message);
        console.error('Load users error:', err);
    } finally {
        hideLoading();
    }
}
function showAdminPanel() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('userInterface').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    updateAdminStats();
    renderUserList();
    renderPendingList();
    renderPaidList();
}

function showUserInterface() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('userInterface').classList.remove('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
}




// Initiate password reset for user
// Initiate password reset using Supabase's built-in functionality
async function initiatePasswordReset(userId) {
    try {
        showLoading();
        
        // Get user email from auth.users table
        const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
        
        if (authError || !authUser) {
            showToast('Failed to find user: ' + (authError?.message || 'User not found'));
            return;
        }
        
        const userEmail = authUser.user.email;
        
        // Use Supabase's built-in password reset
        const { error: resetError } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: userEmail,
        });
        
        if (resetError) {
            showToast('Failed to generate reset link: ' + resetError.message);
            return;
        }
        
        // Log admin action
        await logAdminAction('initiate_password_reset', userId, {
            user_email: userEmail,
            timestamp: new Date().toISOString()
        });
        
        showToast(`Password reset email sent to ${userEmail}`);
        
    } catch (err) {
        console.error('Password reset error:', err);
        showToast('Failed to initiate password reset: ' + err.message);
    } finally {
        hideLoading();
    }
}

// Reject pending payslip
async function rejectPayslip(payslipId) {
    try {
        showLoading();
        const { error } = await supabase
            .from('payslips')
            .update({ status: 'rejected' })
            .eq('id', payslipId);
        
        if (error) throw error;
        
        // Log admin action
        await supabase
            .from('admin_actions')
            .insert({
                admin_id: currentUser,
                action_type: 'reject_payslip',
                target_user_id: payslipId, // This would need to be the user_id from payslip
                details: { payslip_id: payslipId, timestamp: new Date().toISOString() }
            });
        
        showToast('Payslip rejected successfully!');
        renderPendingList();
    } catch (err) {
        showToast('Failed to reject payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

// Remove from paid payslips (reopen payslip)
async function reopenPayslip(payslipId) {
    try {
        showLoading();
        const { error } = await supabase
            .from('payslips')
            .update({ 
                status: 'pending',
                payment_date: null,
                reference: null
            })
            .eq('id', payslipId);
        
        if (error) throw error;
        
        // Log admin action
        await supabase
            .from('admin_actions')
            .insert({
                admin_id: currentUser,
                action_type: 'reopen_payslip',
                target_user_id: payslipId, // This would need to be the user_id from payslip
                details: { payslip_id: payslipId, timestamp: new Date().toISOString() }
            });
        
        showToast('Payslip reopened successfully!');
        renderPaidList();
        renderPendingList();
    } catch (err) {
        showToast('Failed to reopen payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}


// Check if user has admin privileges
async function validateAdminAccess() {
    try {
        if (!currentUser) return false;
        
        // Check if user is admin in profiles table
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', currentUser)
            .single();
        
        if (error) {
            console.error('Admin validation error:', error);
            return false;
        }
        
        return profile.is_admin === true;
    } catch (err) {
        console.error('Admin validation failed:', err);
        return false;
    }
}

// Enhanced admin check for sensitive operations
async function withAdminCheck(operation) {
    const isAdmin = await validateAdminAccess();
    if (!isAdmin) {
        showToast('Administrator privileges required');
        return false;
    }
    
    return operation();
}

// Delete payslip permanently
// Delete payslip permanently from database (for admin panel)
async function deletePayslip(payslipId) {
    const modal = document.getElementById('confirmModal');
    const message = document.getElementById('confirmMessage');
    
    message.textContent = 'Are you sure you want to permanently delete this payslip from the database? This action cannot be undone.';
    modal.style.display = 'flex';
    
    document.getElementById('confirmAction').onclick = async () => {
        showLoading();
        try {
            // First get payslip details for logging
            const { data: payslip, error: fetchError } = await supabase
                .from('payslips')
                .select('user_id, employeename, totals')
                .eq('id', payslipId)
                .single();
            
            if (fetchError) throw fetchError;
            
            // Delete the payslip permanently from database
            const { error } = await supabase
                .from('payslips')
                .delete()
                .eq('id', payslipId);
            
            if (error) throw error;
            
            // Log admin action
            await logAdminAction('delete_payslip', payslip.user_id, {
                payslip_id: payslipId,
                employee_name: payslip.employeename,
                amount: payslip.totals?.grandTotal || 0,
                timestamp: new Date().toISOString()
            });
            
            showToast('Payslip deleted permanently from database!');
            
            // Refresh the lists
            renderPaidList();
            renderPendingList();
            updateAdminStats();
        } catch (err) {
            console.error('Delete payslip error:', err);
            showToast('Failed to delete payslip: ' + err.message);
        } finally {
            modal.style.display = 'none';
            hideLoading();
        }
    };
}