const supabaseUrl = 'https://puwgsdzuqsjjtriyhrqv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1d2dzZHp1cXNqanRyaXlocnF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjEwMzk2MywiZXhwIjoyMDcxNjc5OTYzfQ.R0egVbF2PjAJQ82MWUCHTdLq6UtRYnPHgj-V8Oly_I0'; // Replace with the correct anon key from Supabase dashboard
//auth.js
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
        const { data, error } = await timeout(supabase.auth.signInWithPassword({ email, password }), 5000);
        if (error) throw new Error(`Authentication failed: ${error.message}`);
        currentUser = data.user.id;
        localStorage.setItem('currentUser', currentUser);

        const { data: profile } = await timeout(
            supabase.from('profiles').select('*').eq('id', currentUser).single(),
            5000
        );

        if (!profile) {
            const { data: newProfile } = await timeout(
                supabase.from('profiles').insert({
                    id: currentUser,
                    employee_name: email.split('@')[0],
                    employee_role: 'Employee',
                    hourly_rate: 0,
                    bonus: 0,
                    is_admin: email === 'admin@enzopay.com'
                }).select().single(),
                5000
            );
        }

        const { data: finalProfile } = await supabase.from('profiles').select('*').eq('id', currentUser).single();
        isAdminUser = finalProfile.is_admin || false;

        if (isAdminUser) {
            showAdminPanel();
        } else {
            showUserInterface();
        }
        await updateLastLogin();
        showToast('Login successful!');
    } catch (err) {
        showToast(`Login failed: ${err.message}`);
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
        const { error } = await timeout(
            supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', currentUser),
            5000
        );
        if (error) throw error;
    } catch (err) {
        showToast('Failed to update last login: ' + err.message);
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
        // Initialize admin client with service key (ensure correct URL)
        const adminSupabase = supabase; // Assumes initialized with service_role key
        console.log(`Creating user with email: ${newEmail}`);

        // Create auth user with explicit invite (sends confirmation email)
        const { data: authData, error: authErr } = await timeout(
            adminSupabase.auth.admin.createUser({
                email: newEmail,
                password: newPassword,
                email_confirm: false, // Let inviteUserByEmail handle confirmation
                user_metadata: {
                    employee_name: newEmployeeName,
                    employee_role: newEmployeeRole
                }
            }),
            5000
        );

        if (authErr) {
            console.error('Auth creation error:', authErr);
            throw new Error(`Failed to create user: ${authErr.message}`);
        }

        const userId = authData.user.id;
        console.log(`User created with ID: ${userId}`);

        // Send confirmation email via invite
        const { error: inviteErr } = await timeout(
            adminSupabase.auth.admin.inviteUserByEmail(newEmail, {
                redirectTo: 'https://enzotimesheet.vercel.app/' // Update to your app's confirmation URL
            }),
            5000
        );

        if (inviteErr) {
            console.error('Invite email error:', inviteErr);
            // Optional: Roll back if email fails
            await adminSupabase.auth.admin.deleteUser(userId);
            throw new Error(`Failed to send confirmation email: ${inviteErr.message}`);
        }

        // Create profile
        console.log(`Creating profile for user ${userId}`);
        const { error: profileErr } = await timeout(
            adminSupabase.from('profiles').insert({
                id: userId,
                employee_name: newEmployeeName,
                employee_role: newEmployeeRole,
                hourly_rate: newHourlyRate,
                bonus: newBonus,
                is_admin: false
            }),
            5000
        );

        if (profileErr) {
            console.error('Profile creation error:', profileErr);
            // Roll back auth user
            await adminSupabase.auth.admin.deleteUser(userId);
            throw new Error(`Failed to create profile: ${profileErr.message}`);
        }

        // Create default user settings
        console.log(`Creating default settings for user ${userId}`);
        const { error: settingsErr } = await timeout(
            adminSupabase.from('user_settings').insert({
                user_id: userId,
                include_breaks_default: true,
                currency: 'USD',
                date_format: 'YYYY-MM-DD'
            }),
            5000
        );

        if (settingsErr) {
            console.error('Settings creation error:', settingsErr);
            // Optional: Roll back profile and auth
            await adminSupabase.from('profiles').delete().eq('id', userId);
            await adminSupabase.auth.admin.deleteUser(userId);
            throw new Error(`Failed to create user settings: ${settingsErr.message}`);
        }

        // Log admin action
        console.log(`Logging user creation for ${userId}`);
        await logAdminAction('create_user', userId, {
            user_name: newEmployeeName,
            email: newEmail,
            timestamp: new Date().toISOString()
        });

        showToast('User added successfully, confirmation email sent');
        e.target.reset();
        renderUserList();
        updateAdminStats();
    } catch (err) {
        console.error('Add user error:', err);
        showToast(`Add user failed: ${err.message}`);
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
            // Verify user exists in auth.users
            console.log(`Checking user ${id} in auth.users`);
            const { data: user, error: checkErr } = await supabase.auth.admin.getUserById(id);
            if (checkErr || !user) {
                console.warn(`User ${id} not found in auth.users`);
                showToast('User not found in authentication system.');
                return;
            }

            // Fetch profile for logging (optional, for employee_name)
            console.log(`Fetching profile for user ${id}`);
            const { data: userData, error: profileFetchErr } = await supabase
                .from('profiles')
                .select('employee_name')
                .eq('id', id)
                .maybeSingle(); // Use maybeSingle to handle missing profiles
            if (profileFetchErr) {
                console.error('Profile fetch error:', profileFetchErr);
                // Continue deletion even if profile is missing
            }

            // Clean related tables to avoid constraint issues
            console.log(`Cleaning related data for user ${id}`);
            const { error: settingsErr } = await supabase.from('user_settings').delete().eq('user_id', id);
            if (settingsErr) console.error('Settings delete error:', settingsErr);

            const { error: payslipErr } = await supabase.from('payslips').delete().eq('user_id', id);
            if (payslipErr) console.error('Payslips delete error:', payslipErr);

            const { error: actionsErr } = await supabase.from('admin_actions').delete().eq('target_user_id', id);
            if (actionsErr) console.error('Admin actions delete error:', actionsErr);

            // Delete profile
            console.log(`Deleting profile for user ${id}`);
            const { error: profileErr } = await supabase.from('profiles').delete().eq('id', id);
            if (profileErr) console.error('Profile delete error:', profileErr);

            // Delete auth user
            console.log(`Deleting auth user ${id}`);
            const { error: authError } = await supabase.auth.admin.deleteUser(id);
            if (authError) {
                console.error('Auth delete error:', authError);
                throw new Error(`Failed to delete user from auth: ${authError.message}`);
            }

            // Log the action (use null for target_user_id if user is deleted)
            console.log(`Logging admin action for user deletion ${id}`);
            await logAdminAction('delete_user', null, {
                user_id: id,
                user_name: userData?.employee_name || 'Unknown',
                timestamp: new Date().toISOString()
            });

            // Update UI
            renderUserList();
            updateAdminStats();
            showToast('User deleted successfully');
        } catch (err) {
            console.error('Delete failed:', err);
            showToast(`Delete failed: ${err.message}`);
        } finally {
            console.log('Hiding modal and loading state');
            modal.style.display = 'none';
            hideLoading();
        }
    };
}

async function toggleAdminStatus(userId, makeAdmin) {
    try {
        showLoading();
        
        const { data: userData } = await supabase
            .from('profiles')
            .select('employee_name, is_admin')
            .eq('id', userId)
            .single();
        
        if (userId === currentUser && !makeAdmin) {
            showToast('You cannot remove your own admin privileges');
            return;
        }
        
        const { error } = await supabase
            .from('profiles')
            .update({ is_admin: makeAdmin })
            .eq('id', userId);
        
        if (error) throw error;
        
        await logAdminAction(makeAdmin ? 'grant_admin' : 'revoke_admin', userId, {
            user_name: userData?.employee_name,
            previous_status: userData?.is_admin
        });
        
        showToast(`User ${makeAdmin ? 'promoted to admin' : 'demoted from admin'} successfully!`);
        renderUserList();
    } catch (err) {
        showToast('Failed to update admin status: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function updateAdminStats() {
    try {
        showLoading();

        const { count: totalEmployees } = await supabase.from('profiles').select('*', { count: 'exact' });
        const { count: totalAdmins } = await supabase.from('profiles').select('*', { count: 'exact' }).eq('is_admin', true);
        const { count: pendingPayslips } = await supabase.from('payslips').select('*', { count: 'exact' }).eq('status', 'pending');
        const { count: paidPayslips } = await supabase.from('payslips').select('*', { count: 'exact' }).eq('status', 'paid');
        const { data: payrollData } = await supabase.from('payslips').select('grand_total').eq('status', 'paid');
        const totalPayroll = payrollData.reduce((sum, p) => sum + (p.grand_total || 0), 0).toFixed(2);

        const { data: recentActivity } = await supabase.from('payslips').select('employee_name, submission_date').order('submission_date', { ascending: false }).limit(5);

        document.getElementById('totalEmployees').textContent = totalEmployees || 0;
        document.getElementById('totalAdmins').textContent = totalAdmins || 0;
        document.getElementById('pendingPayslips').textContent = pendingPayslips || 0;
        document.getElementById('paidPayslips').textContent = paidPayslips || 0;
        document.getElementById('totalPayroll').textContent = `$${totalPayroll}`;
        document.getElementById('recentActivity').innerHTML = recentActivity
            .map(a => `<li>${a.employee_name || 'Unknown'} submitted on ${new Date(a.submission_date).toLocaleDateString()}</li>`)
            .join('');
    } catch (err) {
        showToast('Failed to load admin stats: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function logAdminAction(actionType, targetUserId, details = {}) {
  try {
    // Verify if target_user_id exists (quick check)
    if (targetUserId) {
      const { data: userCheck, error: checkErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', targetUserId)
        .maybeSingle();  // Graceful for no-match

      if (checkErr || !userCheck) {
        console.warn(`Skipping log for invalid target_user_id: ${targetUserId} (not in profiles)`);
        details.invalid_user_note = 'Target user not found in profiles';  // Add context
        targetUserId = null;  // Nullify if schema allows
      }
    }

    const { error } = await supabase
      .from('admin_actions')
      .insert({
        admin_id: currentUser,
        action_type: actionType,
        target_user_id: targetUserId,  // Now safe
        details: { ...details, timestamp: new Date().toISOString() }
      });

    if (error) console.error('Failed to log admin action:', error);
  } catch (err) {
    console.error('Error logging admin action:', err);
  }
}
async function renderAdminActivityLog() {
    const activityLog = document.getElementById('activityLog');
    if (!activityLog) return;
    
    try {
        showLoading();
        
        const { data: activities, error } = await supabase
            .from('admin_actions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        activityLog.innerHTML = '';
        
        if (!activities.length) {
            activityLog.innerHTML = '<tr><td colspan="5">No admin activities found</td></tr>';
            return;
        }
        
        const userIds = [...new Set([
            ...activities.map(a => a.admin_id),
            ...activities.map(a => a.target_user_id).filter(id => id)
        ])];
        
        const { data: users } = await supabase
            .from('profiles')
            .select('id, employee_name')
            .in('id', userIds);
        
        const userDetails = {};
        users.forEach(u => userDetails[u.id] = u.employee_name);
        
        activities.forEach(activity => {
            const tr = document.createElement('tr');
            const adminName = userDetails[activity.admin_id] || 'Unknown';
            const targetName = activity.target_user_id ? userDetails[activity.target_user_id] || 'Unknown' : 'N/A';
            tr.innerHTML = `
                <td>${adminName}</td>
                <td>${getActionDescription(activity.action_type)}</td>
                <td>${targetName}</td>
                <td>${new Date(activity.created_at).toLocaleString()}</td>
                <td>${JSON.stringify(activity.details || {})}</td>
            `;
            activityLog.appendChild(tr);
        });
    } catch (err) {
        console.error('Failed to load admin activity log:', err);
        activityLog.innerHTML = `<tr><td colspan="5">Error: ${err.message}</td></tr>`;
    } finally {
        hideLoading();
    }
}

function getActionDescription(actionType) {
    const actions = {
        'delete_user': 'Deleted User',
        'grant_admin': 'Granted Admin',
        'revoke_admin': 'Revoked Admin',
        'initiate_password_reset': 'Initiated Password Reset',
        'approve_payslip': 'Approved Payslip',
        'reject_payslip': 'Rejected Payslip',
        'reopen_payslip': 'Reopened Payslip',
        'delete_payslip': 'Deleted Payslip'
    };
    return actions[actionType] || actionType;
}

async function renderUserList() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    try {
        showLoading();
        
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, employee_name, employee_role, hourly_rate, is_admin, last_login')
            .order('employee_name');
        
        const { data: authUsers } = await supabase.auth.admin.listUsers();
        
        const usersWithEmail = profiles.map(profile => ({
            ...profile,
            email: authUsers.users.find(u => u.id === profile.id)?.email || 'N/A'
        }));
        
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

async function initiatePasswordReset(userId) {
    const modal = document.getElementById('confirmModal');
    const message = document.getElementById('confirmMessage');
    const confirmButton = document.getElementById('confirmAction');

    message.textContent = 'Send a password reset email to the user? They will receive a link to set a new password.';
    modal.style.display = 'flex';

    confirmButton.onclick = async () => {
        showLoading();
        try {
            // Verify user exists
            console.log(`Checking user ${userId} in auth.users`);
            const { data: authUser, error: authError } = await timeout(
                supabase.auth.admin.getUserById(userId),
                5000
            );
            if (authError || !authUser) {
                console.error('User fetch error:', JSON.stringify(authError, null, 2));
                showToast('Failed to find user: ' + (authError?.message || 'User not found'));
                return;
            }

            const userEmail = authUser.user.email;
            console.log(`Requesting password reset email for ${userEmail}`);

            // Use client-side resetPasswordForEmail (auto-sends email)
            const { error: clientError } = await timeout(
                supabase.auth.resetPasswordForEmail(userEmail, {
                    redirectTo: 'https://enzotimesheet.vercel.app/reset-password.html' // Update to your reset page URL
                    ,type : 'recovery' // Ensure the type is set to 'recovery'
                }),
                5000
            );

            if (clientError) {
                console.error('Client reset error:', JSON.stringify(clientError, null, 2));
                throw new Error(`Failed to request reset email: ${clientError.message}`);
            }

            console.log('Reset email requested successfully');

            // Log admin action
            await logAdminAction('initiate_password_reset', userId, {
                user_email: userEmail,
                reset_link: 'client-side request',
                method: 'resetPasswordForEmail',
                timestamp: new Date().toISOString()
            });

            showToast(`Password reset email sent to ${userEmail}`);
        } catch (err) {
            console.error('Password reset error:', JSON.stringify(err, null, 2));
            showToast(`Failed to initiate password reset: ${err.message}`);
        } finally {
            modal.style.display = 'none';
            hideLoading();
        }
    };
}
async function validateAdminAccess() {
    if (!currentUser) return false;
    
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', currentUser)
        .single();
    
    return profile?.is_admin === true;
}

async function deletePayslip(payslipId) {
    const modal = document.getElementById('confirmModal');
    const message = document.getElementById('confirmMessage');
    
    message.textContent = 'Are you sure you want to permanently delete this payslip?';
    modal.style.display = 'flex';
    
    document.getElementById('confirmAction').onclick = async () => {
        showLoading();
        try {
            const { data: payslip } = await supabase
                .from('payslips')
                .select('user_id, employee_name')
                .eq('id', payslipId)
                .single();
            
            const { error } = await supabase
                .from('payslips')
                .delete()
                .eq('id', payslipId);
            
            if (error) throw error;
            
            await logAdminAction('delete_payslip', payslip.user_id, {
                employee_name: payslip.employee_name
            });
            
            showToast('Payslip deleted!');
            
            renderPaidList();
            renderPendingList();
            updateAdminStats();
        } catch (err) {
            showToast('Failed to delete payslip: ' + err.message);
        } finally {
            modal.style.display = 'none';
            hideLoading();
        }
    };
}