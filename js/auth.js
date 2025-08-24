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
    if (!isAdminUser) return showToast('Unauthorized');
    const newEmail = document.getElementById('newEmail').value;
    const newPassword = document.getElementById('newPassword').value;
    const newEmployeeName = document.getElementById('newEmployeeName').value;
    const newEmployeeRole = document.getElementById('newEmployeeRole').value;
    const newHourlyRate = parseFloat(document.getElementById('newHourlyRate').value) || 0;
    const newBonus = parseFloat(document.getElementById('newBonus').value) || 0;
    showLoading();
    try {
        const { data: authData, error: authErr } = await timeout(
            supabase.auth.signUp({
                email: newEmail,
                password: newPassword,
                email_confirm: true
            }),
            5000
        );
        if (authErr) throw authErr;
        const userId = authData.user.id;
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
    } finally {
        hideLoading();
    }
}

async function deleteUser(id) {
    const modal = document.getElementById('confirmModal');
    const message = document.getElementById('confirmMessage');
    if (!modal || !message) {
        showToast('Error: Confirmation modal not found.');
        return;
    }
    message.textContent = 'Are you sure you want to delete this user?';
    modal.style.display = 'flex';
    document.getElementById('confirmAction').onclick = async () => {
        showLoading();
        try {
            const { error } = await timeout(supabase.auth.admin.deleteUser(id), 5000);
            if (error) throw error;
            const { error: profileError } = await timeout(supabase.from('profiles').delete().eq('id', id), 5000);
            if (profileError) throw profileError;
            renderUserList();
            updateAdminStats();
            showToast('User deleted');
        } catch (err) {
            showToast('Delete failed: ' + err.message);
        } finally {
            modal.style.display = 'none';
            hideLoading();
        }
    };
}


async function updateAdminStats() {
    try {
        showLoading();

        const stats = {
            totalEmployees: 0,
            pendingPayslips: 0,
            totalPayroll: 0,
            recentActivity: []
        };

        // Query profiles table (adjust to 'users' or your actual table name)
        const { data: profiles, error: profileError, count } = await supabase
            .from('profiles') // Replace with 'users' or your table name if different
            .select('id', { count: 'exact' });
        if (profileError) throw new Error(`Profile fetch error: ${profileError.message}`);
        stats.totalEmployees = count || 0;

        // Query pending payslips
        const { data: payslips, error: payslipError, count: payslipCount } = await supabase
            .from('payslips')
            .select('id', { count: 'exact' })
            .eq('status', 'pending');
        if (payslipError) throw new Error(`Payslip fetch error: ${payslipError.message}`);
        stats.pendingPayslips = payslipCount || 0;

        // Query total payroll amount
        const { data: payrollData, error: payrollError } = await supabase
            .from('payslips')
            .select('payslip_data')
            .eq('status', 'paid'); // Use 'paid' instead of 'approved' to match your schema
        if (payrollError) throw new Error(`Payroll fetch error: ${payrollError.message}`);
        stats.totalPayroll = payrollData
            .reduce((sum, record) => sum + (record.payslip_data?.totals?.grandTotal || 0), 0)
            .toFixed(2);

        // Fetch recent activity
        const { data: activityData, error: activityError } = await supabase
            .from('payslips')
            .select('employeename, submissiondate')
            .order('submissiondate', { ascending: false })
            .limit(5);
        if (activityError) throw new Error(`Activity fetch error: ${activityError.message}`);
        stats.recentActivity = activityData.map(item => ({
            employee: item.employeename || 'Unknown',
            date: new Date(item.submissionDate).toLocaleDateString()
        }));

        // Update UI elements with null checks
        const totalEmployeesEl = document.getElementById('totalEmployees');
        const pendingPayslipsEl = document.getElementById('pendingPayslips');
        const totalPayrollEl = document.getElementById('totalPayroll');
        const activityListEl = document.getElementById('recentActivity');

        if (totalEmployeesEl) totalEmployeesEl.textContent = stats.totalEmployees;
        else console.warn('Element totalEmployees not found in DOM');
        if (pendingPayslipsEl) pendingPayslipsEl.textContent = stats.pendingPayslips;
        else console.warn('Element pendingPayslips not found in DOM');
        if (totalPayrollEl) totalPayrollEl.textContent = `$${stats.totalPayroll}`;
        else console.warn('Element totalPayroll not found in DOM');
        if (activityListEl) {
            activityListEl.innerHTML = stats.recentActivity
                .map(activity => `<li>${activity.employee} submitted a payslip on ${activity.date}</li>`)
                .join('');
        } else {
            console.warn('Element recentActivity not found in DOM');
        }

        showToast('Admin stats updated successfully!');
    } catch (err) {
        console.error('Failed to update admin stats:', err.message);
        showToast('Failed to load admin stats: ' + err.message);
        // Fallback values
        const totalEmployeesEl = document.getElementById('totalEmployees');
        const pendingPayslipsEl = document.getElementById('pendingPayslips');
        const totalPayrollEl = document.getElementById('totalPayroll');
        if (totalEmployeesEl) totalEmployeesEl.textContent = 'N/A';
        if (pendingPayslipsEl) pendingPayslipsEl.textContent = 'N/A';
        if (totalPayrollEl) totalPayrollEl.textContent = '$0.00';
    } finally {
        hideLoading();
    }
}

// 2. Render pending payslips from database
async function renderPendingList() {
    const pendingList = document.getElementById('pendingList');
    if (!pendingList) {
        showToast('Pending list element not found.');
        return;
    }
    pendingList.innerHTML = '';
    try {
        showLoading();
        const { data: pendingPayslips, error } = await supabase
            .from('payslips')
            .select('id, user_id,employeename, payslip_data, submissiondate','totals')
            .eq('status', 'pending')
            .order('submissiondate', { ascending: false });
        if (error) throw error;

        if (!Array.isArray(pendingPayslips) || pendingPayslips.length === 0) {
            pendingList.innerHTML = '<p>No pending payslips.</p>';
            return;
        }

        pendingPayslips.forEach((payslip, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '15px';

            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${payslip.employeename || 'Unknown'} - $${(payslip?.totals?.grandTotal || 0).toFixed(2)}</h3>
                    <div>
                        <button class="btn btn-sm btn-info" onclick="viewPayslipDetails('${payslip.id}', 'pending')">
                            <i class="fas fa-eye"></i> Details
                        </button>
                        <button class="btn btn-sm btn-success" onclick="markAsPaid('${payslip.id}')">
    <i class="fas fa-check"></i> Mark Paid
</button>
                    </div>
                </div>
                <p><strong>User:</strong> ${payslip.user_id || ''}</p>
                <p><strong>Submitted:</strong> ${payslip.submissiondate ? new Date(payslip.submissiondate).toLocaleDateString() : ''}</p>
                <p><strong>Include Breaks:</strong> ${payslip.includebreaks ? 'Yes' : 'No'}</p>
                <div class="form-group">
                    <label class="form-label">Payment Reference</label>
                    <input type="text" class="form-control" id="paymentRef-${payslip.id}" placeholder="Enter payment reference">
                </div>
            `;
            pendingList.appendChild(card);
        });

        showToast('Pending payslips loaded successfully!');
    } catch (err) {
        showToast('Failed to load pending payslips: ' + err.message);
    } finally {
        hideLoading();
    }
}

// 3. Render paid payslips from database
async function renderPaidList() {
    const paidList = document.getElementById('paidList');
    if (!paidList) {
        showToast('Paid list element not found.');
        return;
    }
    paidList.innerHTML = '';
    try {
        showLoading();
        const { data: paidPayslips, error } = await supabase
            .from('payslips')
            .select('id,user_id, employeename,payment_date, payslip_data, submissiondate', 'reference','totals')
            .eq('status', 'paid')
            .order('payment_date', { ascending: false });
        if (error) throw error;

        if (!Array.isArray(paidPayslips) || paidPayslips.length === 0) {
            paidList.innerHTML = '<p>No paid payslips.</p>';
            return;
        }

        paidPayslips.forEach((payslip, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '15px';
            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${payslip.employeename || 'Unknown'} - $${(payslip?.totals?.grandTotal || 0).toFixed(2)}</h3>
                    <div>
                        <button class="btn btn-sm btn-info" onclick="viewPayslipDetails('${payslip.id}', 'paid')">
                            <i class="fas fa-eye"></i> Details
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="downloadPayslip('${payslip.id}', 'paid')">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
                <p><strong>User:</strong> ${payslip.user_id || ''}</p>
                <p><strong>Paid on:</strong> ${payslip.payment_date ? new Date(payslip.payment_date).toLocaleDateString() : ''}</p>
                <p><strong>Reference:</strong> ${payslip.reference || 'N/A'}</p>
            `;
            paidList.appendChild(card);
        });

        showToast('Paid payslips loaded successfully!');
    } catch (err) {
        showToast('Failed to load paid payslips: ' + err.message);
    } finally {
        hideLoading();
    }
}
async function renderUserList() {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    try {
        showLoading();
        const { data, error } = await timeout(supabase.from('profiles').select('id, employee_name, employee_role, hourly_rate'), 5000);
        if (error) throw error;
        data.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.email || 'N/A'}</td>
                <td>${user.employee_name}</td>
                <td>${user.employee_role}</td>
                <td>$${user.hourly_rate.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
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


async function toggleAdminStatus(userId, isAdmin) {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      throw new Error('No active session');
    }

    const { data: caller, error: callerError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (callerError || caller?.role !== 'admin') {
      throw new Error('Forbidden: Admin access required');
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: isAdmin })
      .eq('id', userId);
    if (error) {
      throw new Error(`Failed to update admin status: ${error.message}`);
    }

    showToast(`Admin status ${isAdmin ? 'enabled' : 'disabled'} successfully!`);
    await renderUserList();
  } catch (err) {
    console.error('Toggle admin status failed:', err);
    showToast(`Failed to update admin status: ${err.message}`);
  }
}