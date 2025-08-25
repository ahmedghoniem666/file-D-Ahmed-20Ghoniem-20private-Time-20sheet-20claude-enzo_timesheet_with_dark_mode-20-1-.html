let historyData = [];
let pendingPayslips = [];
let paidPayslips = [];

async function loadUserData() {
    if (!currentUser) {
        console.error('No current user, cannot load data.');
        showToast('No user logged in.');
        return;
    }
    try {
        console.log('Loading user data for ID:', currentUser);
        const { data: profile, error: profileErr } = await timeout(supabase.from('profiles').select('*').eq('id', currentUser).single(), 5000);
        if (profileErr) {
            console.error('Profile fetch error:', profileErr);
            throw profileErr;
        }
        console.log('Profile loaded:', profile);
        document.getElementById('employeeName').value = profile.employee_name || '';
        document.getElementById('employeeRole').value = profile.employee_role || '';
        document.getElementById('hourlyRate').value = profile.hourly_rate || 0;
        document.getElementById('bonus').value = profile.bonus || 0;

        const { data: payment, error: paymentErr } = await timeout(supabase.from('payment_data').select('*').eq('user_id', currentUser).single(), 5000);
        let paymentData;
        if (paymentErr && paymentErr.code === 'PGRST116') {
            console.log('No payment data found, creating default for user:', currentUser);
            const defaultPaymentData = { history: [], timesheet: { rows: [], includeBreaks: false } };
            const { data: newPayment, error: insertErr } = await timeout(
                supabase.from('payment_data').insert({ user_id: currentUser, payment_data: defaultPaymentData }).select().single(),
                5000
            );
            if (insertErr) {
                console.error('Payment data creation error:', insertErr);
                throw insertErr;
            }
            paymentData = newPayment.payment_data;
            console.log('Default payment data created:', paymentData);
        } else if (paymentErr) {
            console.error('Payment data fetch error:', paymentErr);
            throw paymentErr;
        } else {
            paymentData = payment.payment_data || { history: [], timesheet: { rows: [], includeBreaks: false } };
            console.log('Payment data loaded:', paymentData);
        }

        historyData = Array.isArray(paymentData.history) ? paymentData.history.filter(p => p && p.days && Array.isArray(p.days)) : [];
        document.getElementById('includeBreaks').checked = paymentData.timesheet?.includeBreaks || false;
        const tbody = document.getElementById('timesheetBody');
        tbody.innerHTML = '';
        const rows = Array.isArray(paymentData.timesheet?.rows) ? paymentData.timesheet.rows : [];
        console.log('Loading timesheet rows:', rows);
        rows.forEach((day, index) => {
            if (day && day.date) {
                addDay(day.date, day.workHours || 0, day.breakHours || 0, day.dayOff || false);
            } else {
                console.warn(`Invalid timesheet row at index ${index}:`, day);
            }
        });
        updateRowAndTotals();
        renderUserHistory();
        updateUserStats();
        console.log('User data loaded successfully');
    } catch (err) {
        console.error('Failed to load user data:', err);
        showToast('Failed to load user data: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function saveUserData() {
    if (!currentUser) {
        console.error('No current user, cannot save data.');
        return;
    }
    
    try {
        // Only save profile data and current timesheet, not history
        const profileUpdate = {
            employee_name: document.getElementById('employeeName').value || '',
            employee_role: document.getElementById('employeeRole').value || '',
            hourly_rate: parseFloat(document.getElementById('hourlyRate').value) || 0,
            bonus: parseFloat(document.getElementById('bonus').value) || 0
        };
        
        const { error: profileErr } = await supabase.from('profiles').update(profileUpdate).eq('id', currentUser);
        if (profileErr) throw profileErr;
        
        // Only save current timesheet, not history
        const rows = [];
        document.querySelectorAll('#timesheetBody tr').forEach(row => {
            const date = row.querySelector('.date').value;
            if (date) {
                rows.push({
                    date,
                    dayOff: row.querySelector('.dayOff').checked,
                    workHours: parseFloat(row.querySelector('.workHours').value) || 0,
                    breakHours: parseFloat(row.querySelector('.breakHours').value) || 0
                });
            }
        });
        
        const paymentData = {
            timesheet: { 
                rows, 
                includeBreaks: document.getElementById('includeBreaks').checked 
            }
            // No history data saved locally anymore
        };
        
        const { error: paymentErr } = await supabase.from('payment_data').upsert({ 
            user_id: currentUser, 
            payment_data: paymentData 
        });
        
        if (paymentErr) throw paymentErr;
        
        updateLastUpdated();
    } catch (err) {
        console.error('Failed to save user data:', err);
    }
}

function updateLastUpdated() {
    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
}

function addDay( workHours = 0, breakHours = 1, isDayOff = false) {
    const tbody = document.getElementById('timesheetBody');
    const tr = document.createElement('tr');
    const today = new Date().toISOString().split('T')[0];
    
    //const date = today;
    tr.innerHTML = `
        <td><input type="date" class="form-control date" value="${today}"></td>
        <td><input type="checkbox" class="dayOff" ${isDayOff ? 'checked' : ''}></td>
        <td><input type="number" class="form-control workHours" step="0.01" value="${workHours}" ${isDayOff ? 'disabled' : ''}></td>
        <td><input type="number" class="form-control breakHours" step="0.01" value="${breakHours}" ${isDayOff ? 'disabled' : ''}></td>
        <td class="totalHours">0.00</td>
        <td class="amount">$0.00</td>
        <td><button class="btn btn-sm btn-danger deleteRow"><i class="fas fa-trash"></i></button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.deleteRow').addEventListener('click', () => {
        tr.remove();
        updateRowAndTotals();
        saveUserData();
    });
    tr.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
        updateRowAndTotals();
        saveUserData();
    }));
    tr.querySelector('.dayOff').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        tr.querySelector('.workHours').disabled = isChecked;
        tr.querySelector('.breakHours').disabled = isChecked;
        updateRowAndTotals();
        saveUserData();
    });
    updateRowAndTotals();
}

function addWeek() {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        addDay(date.toISOString().split('T')[0]);
    }
}

function updateRowAndTotals() {
    const includeBreaks = document.getElementById('includeBreaks').checked;
    const rate = parseFloat(document.getElementById('hourlyRate').value) || 0;
    const bonus = parseFloat(document.getElementById('bonus').value) || 0;
    let totalWork = 0, totalBreak = 0, totalTotal = 0, basePay = 0;
    document.querySelectorAll('#timesheetBody tr').forEach(row => {
        const dayOff = row.querySelector('.dayOff').checked;
        const work = parseFloat(row.querySelector('.workHours').value) || 0;
        const brk = parseFloat(row.querySelector('.breakHours').value) || 0;
        const totalH = dayOff ? 0 : (includeBreaks ? work + brk : work);
        const amt = totalH * rate;
        row.querySelector('.totalHours').textContent = totalH.toFixed(2);
        row.querySelector('.amount').textContent = `$${amt.toFixed(2)}`;
        if (!dayOff) {
            totalWork += work;
            totalBreak += brk;
            totalTotal += totalH;
            basePay += amt;
        }
    });
    document.getElementById('totalWorkingHours').textContent = totalWork.toFixed(2);
    document.getElementById('totalBreakHours').textContent = totalBreak.toFixed(2);
    document.getElementById('totalHours').textContent = totalTotal.toFixed(2);
    document.getElementById('basePay').textContent = `$${basePay.toFixed(2)}`;
    document.getElementById('grandTotal').textContent = `$${(basePay + bonus).toFixed(2)}`;
    //showToast('Timesheet updated.');
}

function getPayslipData() {
    const includeBreaks = document.getElementById('includeBreaks').checked;
    const employeeName = document.getElementById('employeeName').value;
    const employeeRole = document.getElementById('employeeRole').value;
    const hourlyRate = parseFloat(document.getElementById('hourlyRate').value) || 0;
    const bonus = parseFloat(document.getElementById('bonus').value) || 0;
    const days = [];
    document.querySelectorAll('#timesheetBody tr').forEach(row => {
        const date = row.querySelector('.date').value;
        if (date) {
            days.push({
                date,
                dayOff: row.querySelector('.dayOff').checked,
                workHours: parseFloat(row.querySelector('.workHours').value) || 0,
                breakHours: parseFloat(row.querySelector('.breakHours').value) || 0,
                totalHours: parseFloat(row.querySelector('.totalHours').textContent) || 0,
                amount: parseFloat(row.querySelector('.amount').textContent.replace('$', '')) || 0
            });
        }
    });
    const totals = {
        workHours: parseFloat(document.getElementById('totalWorkingHours').textContent) || 0,
        breakHours: parseFloat(document.getElementById('totalBreakHours').textContent) || 0,
        totalHours: parseFloat(document.getElementById('totalHours').textContent) || 0,
        basePay: parseFloat(document.getElementById('basePay').textContent.replace('$', '')) || 0,
        grandTotal: parseFloat(document.getElementById('grandTotal').textContent.replace('$', '')) || 0
    };
    return { 
        user: currentUser, 
        employeeName, 
        employeeRole, 
        hourlyRate, 
        bonus, 
        includeBreaks, 
        days, 
        totals,
        submissionDate: new Date().toISOString()
    };
}

// Submit the last saved history item to database
// Submit all saved payslips to database
async function submitPayslip() {
    // Get all saved (not yet submitted) payslips
    const savedPayslips = historyData.filter(payslip => payslip.status === 'saved');
    
    if (savedPayslips.length === 0) {
        showToast('No saved payslips to submit. Please save some payslips first.');
        return;
    }
    
    showLoading();
    
    try {
        let submittedCount = 0;
        let errors = [];
        
        // Submit each saved payslip
        for (const payslip of savedPayslips) {
            try {
                console.log('Submitting saved payslip to database:', payslip.id);
                
                const { error } = await supabase.from('payslips').insert({
                    user_id: currentUser,
                    employeename: payslip.employeeName,
                    employeerole: payslip.employeeRole,
                    hourlyrate: payslip.hourlyRate,
                    bonus: payslip.bonus,
                    includebreaks: payslip.includeBreaks,
                    days: payslip.days,
                    totals: payslip.totals,
                    submissiondate: new Date().toISOString(),
                    status: 'pending',
                    payslip_data: {
                        employeeName: payslip.employeeName,
                        employeeRole: payslip.employeeRole,
                        hourlyRate: payslip.hourlyRate,
                        bonus: payslip.bonus,
                        includeBreaks: payslip.includeBreaks,
                        days: payslip.days,
                        totals: payslip.totals,
                        submissionDate: new Date().toISOString(),
                        wasFromHistory: true,
                        originalSavedAt: payslip.savedAt,
                        localId: payslip.id
                    }
                });
                
                if (error) {
                    console.error('Payslip submission error:', error);
                    errors.push(`Payslip ${payslip.id}: ${error.message}`);
                    continue;
                }
                
                // Mark as submitted in local history
                const index = historyData.findIndex(item => item.id === payslip.id);
                if (index !== -1) {
                    historyData[index].status = 'submitted';
                    historyData[index].submittedAt = new Date().toISOString();
                    historyData[index].submittedToDB = true;
                }
                
                submittedCount++;
                
            } catch (err) {
                console.error('Error submitting payslip:', payslip.id, err);
                errors.push(`Payslip ${payslip.id}: ${err.message}`);
            }
        }
        
        // Save updated history
        saveUserData();
        renderUserHistory();
        
        // Show results
        if (submittedCount > 0) {
            if (errors.length === 0) {
                showToast(`Successfully submitted ${submittedCount} payslip(s)!`);
            } else {
                showToast(`Submitted ${submittedCount} payslip(s), ${errors.length} failed. See console for details.`);
                console.error('Submission errors:', errors);
            }
        } else {
            showToast('No payslips were submitted. All attempts failed.');
        }
        
        updateUserStats();
        
    } catch (err) {
        console.error('Submit process failed:', err);
        showToast('Submit process failed: ' + err.message);
    } finally {
        hideLoading();
    }
}

// Save to local history and set as last saved item
// Save payslip to database with "saved" status
async function saveHistory(silent = false) {
    showLoading();
    const payslip = getPayslipData();
    
    if (!payslip.days.length) {
        showToast('No timesheet data to save.');
        console.warn('No payslip data to save');
        hideLoading();
        return;
    }
    
    try {
        const savedAt = new Date().toISOString();
        
        const { data, error } = await supabase.from('payslips').insert({
            user_id: currentUser,
            employeename: payslip.employeeName,
            employeerole: payslip.employeeRole,
            hourlyrate: payslip.hourlyRate,
            bonus: payslip.bonus,
            includebreaks: payslip.includeBreaks,
            days: payslip.days,
            totals: payslip.totals,
            saved_at: savedAt,
            status: 'saved', // Save with "saved" status
            payslip_data: {
                employeeName: payslip.employeeName,
                employeeRole: payslip.employeeRole,
                hourlyRate: payslip.hourlyRate,
                bonus: payslip.bonus,
                includeBreaks: payslip.includeBreaks,
                days: payslip.days,
                totals: payslip.totals,
                savedAt: savedAt,
                status: 'saved'
            }
        }).select(); // Get the inserted data
        
        if (error) throw error;
        
        // Add to local history array for UI display
        const savedPayslip = {
            ...payslip,
            id: data[0].id, // Database ID
            savedAt: savedAt,
            status: 'saved',
            dbId: data[0].id
        };
        
        historyData.push(savedPayslip);
        renderUserHistory();
        
        if (!silent) showToast('Payslip saved to database successfully!');
        
    } catch (err) {
        console.error('Save history failed:', err);
        showToast('Failed to save payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}
// Load and render saved payslips from database with proper status labels
async function renderUserHistory() {
    const paymentHistory = document.getElementById('paymentHistory');
    paymentHistory.innerHTML = '<p>Loading history...</p>';
    
    try {
        // Get all payslips for this user from database (not just saved ones)
        const { data: userPayslips, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('user_id', currentUser)
            .order('saved_at', { ascending: false });
        
        if (error) throw error;
        
        paymentHistory.innerHTML = '';
        
        if (!userPayslips || userPayslips.length === 0) {
            paymentHistory.innerHTML = '<p>No payslips found.</p>';
            return;
        }
        
        // Update local history array
        historyData = userPayslips.map(payslip => ({
            id: payslip.id,
            dbId: payslip.id,
            employeeName: payslip.employeename,
            employeeRole: payslip.employeerole,
            hourlyRate: payslip.hourlyrate,
            bonus: payslip.bonus,
            includeBreaks: payslip.includebreaks,
            days: payslip.days,
            totals: payslip.totals,
            savedAt: payslip.saved_at,
            submissionDate: payslip.submissiondate,
            paymentDate: payslip.paymentdate,
            status: payslip.status,
            reference: payslip.reference,
            payslip_data: payslip.payslip_data
        }));
        
        // Render the payslips
        historyData.forEach((payslip) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '15px';
            
            // Get status display text and badge class
            const statusInfo = getStatusDisplay(payslip.status);
            
            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${payslip.employeeName || 'Unknown'} - $${(payslip.totals?.grandTotal || 0).toFixed(2)}</h3>
                    <div class="history-actions">
                        <button class="btn btn-sm btn-info" onclick="viewHistoryDetails('${payslip.id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        ${payslip.status === 'saved' ? `
                        <button class="btn btn-sm btn-success" onclick="submitSinglePayslip('${payslip.id}')">
                            <i class="fas fa-paper-plane"></i> Submit
                        </button>
                        ` : ''}
                        <button class="btn btn-sm btn-danger" onclick="deleteHistoryItem('${payslip.id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                        
                    </div>
                </div>
                 ${payslip.savedAt ? `<p><strong>Saved:</strong> ${new Date(payslip.savedAt).toLocaleString()}</p>` : ''}
                ${payslip.submissionDate ? `<p><strong>Submitted:</strong> ${new Date(payslip.submissionDate).toLocaleString()}</p>` : ''}
                ${payslip.paymentDate ? `<p><strong>Paid:</strong> ${new Date(payslip.paymentDate).toLocaleString()}</p>` : ''}
                ${payslip.reference ? `<p><strong>Reference:</strong> ${payslip.reference}</p>` : ''}
                <p><strong>Period:</strong> ${payslip.days[0]?.date || 'N/A'} to ${payslip.days[payslip.days.length - 1]?.date || 'N/A'}</p>
                <p><strong>Status:</strong> <span class="badge ${statusInfo.badgeClass}">${statusInfo.displayText}</span></p>
            `;
            paymentHistory.appendChild(card);
        });
        
    } catch (err) {
        console.error('Failed to load history:', err);
        paymentHistory.innerHTML = `<p>Error loading history: ${err.message}</p>`;
    }
}

// Helper function to get status display text and badge class
function getStatusDisplay(status) {
    switch (status) {
        case 'saved':
            return {
                displayText: 'Saved (Ready to Submit)',
                badgeClass: 'badge-warning'
            };
        case 'pending':
            return {
                displayText: 'Submitted (Pending Approval)',
                badgeClass: 'badge-info'
            };
        case 'paid':
            return {
                displayText: 'Submitted (Approved & Paid)',
                badgeClass: 'badge-success'
            };
        case 'rejected':
            return {
                displayText: 'Rejected',
                badgeClass: 'badge-danger'
            };
        default:
            return {
                displayText: status || 'Unknown',
                badgeClass: 'badge-secondary'
            };
    }
}
// Submit a saved payslip by changing its status to "pending"
async function submitSinglePayslip(payslipId) {
    showLoading();
    
    try {
        const submissionDate = new Date().toISOString();
        
        // Update the payslip status from "saved" to "pending"
        const { error } = await supabase
            .from('payslips')
            .update({
                status: 'pending',
                submissiondate: submissionDate,
                payslip_data: {
                    status: 'pending',
                    submissionDate: submissionDate,                }
            })
            .eq('id', payslipId)
            .eq('status', 'saved'); // Only update if still in saved status
        
        if (error) throw error;
        
        // Update local history
        const index = historyData.findIndex(item => item.id === payslipId);
        if (index !== -1) {
            historyData[index].status = 'pending';
            historyData[index].submissionDate = submissionDate;
            historyData[index].submittedAt = new Date().toISOString();
        }
        
        renderUserHistory();
        showToast('Payslip submitted successfully! Status: Pending Approval');
        
    } catch (err) {
        console.error('Submit single payslip failed:', err);
        showToast('Failed to submit payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}
// Delete a history item
// Update the deleteHistoryItem function to delete from database
async function deleteHistoryItem(index) {
    if (index < 0 || index >= historyData.length) {
        showToast('Invalid history item.');
        return;
    }
    
    const payslip = historyData[index];
    
    if (!confirm('Are you sure you want to delete this payslip from the database?')) {
        return;
    }
    
    showLoading();
    
    try {
        // If it was submitted to DB, delete it from the database
        if (payslip.submittedToDB && payslip.dbId) {
            const { error } = await supabase
                .from('payslips')
                .delete()
                .eq('id', payslip.dbId);
            
            if (error) throw error;
            
            // Log admin action
            await logAdminAction('delete_payslip', payslip.dbId, {
                payslip_id: payslip.dbId,
                employee_name: payslip.employeeName,
                timestamp: new Date().toISOString()
            });
        }
        
        // Remove from local history regardless
        historyData.splice(index, 1);
        saveUserData();
        renderUserHistory();
        
        showToast('Payslip deleted successfully!');
        updateAdminStats();
        
    } catch (err) {
        console.error('Delete payslip error:', err);
        showToast('Failed to delete payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

// View history details

// View history details with proper status display
async function viewHistoryDetails(payslipId) {
    try {
        // Get payslip details from database
        const { data: payslip, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('id', payslipId)
            .order('saved_at', { ascending: false })
            .single();
        
        if (error) throw error;
        
        const statusInfo = getStatusDisplay(payslip.status);
        const detailsContent = document.getElementById('detailsContent');
        
        if (detailsContent) {
            detailsContent.innerHTML = `
                <h3>Payslip Details</h3>
                <p><strong>Employee:</strong> ${payslip.employeename || 'Unknown'} (${payslip.employeerole || 'Unknown'})</p>
                <p><strong>Status:</strong> <span class="badge ${statusInfo.badgeClass}">${statusInfo.displayText}</span></p>
                <p><strong>Saved:</strong> ${new Date(payslip.saved_at).toLocaleString()}</p>
                ${payslip.submissiondate ? `<p><strong>Submitted:</strong> ${new Date(payslip.submissiondate).toLocaleString()}</p>` : ''}
                ${payslip.paymentdate ? `<p><strong>Paid:</strong> ${new Date(payslip.paymentdate).toLocaleString()}</p>` : ''}
                ${payslip.reference ? `<p><strong>Reference:</strong> ${payslip.reference}</p>` : ''}
                <p><strong>Total Amount:</strong> $${(payslip.totals?.grandTotal || 0).toFixed(2)}</p>
                
                <h4>Time Entries</h4>
                <table class="payslip-details-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Day Off</th>
                            <th>Work Hours</th>
                            <th>Break Hours</th>
                            <th>Total Hours</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payslip.days.map(day => `
                            <tr>
                                <td>${day.date || 'N/A'}</td>
                                <td>${day.dayOff ? 'Yes' : 'No'}</td>
                                <td>${(day.workHours || 0).toFixed(2)}</td>
                                <td>${(day.breakHours || 0).toFixed(2)}</td>
                                <td>${(day.totalHours || 0).toFixed(2)}</td>
                                <td>$${(day.amount || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                ${payslip.status === 'saved' ? `
                <div style="margin-top: 20px;">
                    <button class="btn btn-success" onclick="submitSinglePayslip('${payslip.id}'); document.getElementById('detailsModal').style.display='none'">
                        <i class="fas fa-paper-plane"></i> Submit This Payslip
                    </button>
                    ` : ''}
                    <button class="btn btn-danger" onclick="deleteHistoryItem('${payslip.id}'); document.getElementById('detailsModal').style.display='none'" style="margin-left: 10px;">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
                
            `;
            
            const detailsModal = document.getElementById('detailsModal');
            if (detailsModal) {
                detailsModal.style.display = 'flex';
            }
        }
    } catch (err) {
        console.error('Failed to load payslip details:', err);
        showToast('Failed to load payslip details: ' + err.message);
    }
}

async function viewPayslipDetails(id, type) {
    let payslip;

    try {
        showLoading();

        if (type === 'history') {
            payslip = historyData?.[id];
        } else if (type === 'pending' || type === 'paid') {
            // Fetch payslip directly from Supabase using ID
            const { data, error } = await supabase
                .from('payslips')
                .select('id, employeename, payslip_data, submissiondate, payment_date, reference')
                .eq('id', id)
                .single();

            if (error || !data) {
                throw new Error(`Failed to fetch ${type} payslip: ${error?.message || 'No data found'}`);
            }

            payslip = {
                id: data.id,
                employeeName: data.employeename || data.payslip_data?.employeeName || 'Unknown',
                employeeRole: data.payslip_data?.employeeRole || 'Unknown',
                hourlyRate: data.payslip_data?.hourlyRate || 0,
                bonus: data.payslip_data?.bonus || 0,
                includeBreaks: data.payslip_data?.includeBreaks || false,
                days: data.payslip_data?.days || [],
                totals: data.payslip_data?.totals || {},
                submissiondate: data.submissionDate,
                payment_date: data.payment_date,
                reference: data.reference
            };
        }

        if (!payslip || !Array.isArray(payslip.days)) {
            throw new Error('Invalid payslip data: Missing or invalid days array');
        }

        const totals = payslip.totals || {};
        let content = `
            <h3>Payslip Details</h3>
            <p><strong>Employee:</strong> ${payslip.employeeName} (${payslip.employeeRole})</p>
            <p><strong>Hourly Rate:</strong> $${(payslip.hourlyRate || 0).toFixed(2)}</p>
            <p><strong>Bonus:</strong> $${(payslip.bonus || 0).toFixed(2)}</p>
            <p><strong>Include Breaks:</strong> ${payslip.includeBreaks ? 'Yes' : 'No'}</p>
            <h4 style="margin-top: 20px;">Time Entries</h4>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Day Off</th>
                        <th>Work Hours</th>
                        <th>Break Hours</th>
                        <th>Total Hours</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        payslip.days.forEach(day => {
            if (!day || !day.date) return;
            content += `
                <tr>
                    <td>${day.date}</td>
                    <td>${day.dayOff ? 'Yes' : 'No'}</td>
                    <td>${(day.workHours || 0).toFixed(2)}</td>
                    <td>${(day.breakHours || 0).toFixed(2)}</td>
                    <td>${(day.totalHours || 0).toFixed(2)}</td>
                    <td>$${(day.amount || 0).toFixed(2)}</td>
                </tr>
            `;
        });

        content += `
                </tbody>
            </table>
            <h4 style="margin-top: 20px;">Summary</h4>
            <p><strong>Total Work Hours:</strong> ${(totals.workHours || 0).toFixed(2)}</p>
            <p><strong>Total Break Hours:</strong> ${(totals.breakHours || 0).toFixed(2)}</p>
            <p><strong>Total Hours:</strong> ${(totals.totalHours || 0).toFixed(2)}</p>
            <p><strong>Base Pay:</strong> $${(totals.basePay || 0).toFixed(2)}</p>
            <p><strong>Grand Total:</strong> $${(totals.grandTotal || 0).toFixed(2)}</p>
        `;

        if (type === 'paid') {
            content += `
                <p><strong>Paid on:</strong> ${new Date(payslip.payment_date || '').toLocaleDateString()}</p>
                <p><strong>Reference:</strong> ${payslip.reference || 'N/A'}</p>
            `;
        }

        const detailsContent = document.getElementById('detailsContent');
        if (detailsContent) {
            detailsContent.innerHTML = content;
            const detailsModal = document.getElementById('detailsModal');
            if (detailsModal) {
                detailsModal.style.display = 'flex';
            } else {
                console.error('Modal element detailsModal not found in DOM');
                showToast('Failed to display payslip: Modal not found');
            }
        } else {
            console.error('Element detailsContent not found in DOM');
            showToast('Failed to display payslip: Content container not found');
        }
    } catch (err) {
        console.error('Failed to view payslip details:', err.message, { id, type });
        showToast('Failed to view payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}


async function updateUserStats() {
    try {
        showLoading();
        const { data: pending, error: pendingErr } = await timeout(supabase.from('payslips').select('*').eq('user_id', currentUser).eq('status', 'pending'), 5000);
        if (pendingErr) {
            console.error('Pending payslips fetch error:', pendingErr);
            throw pendingErr;
        }
        const { data: paid, error: paidErr } = await timeout(supabase.from('payslips').select('*').eq('user_id', currentUser).eq('status', 'paid'), 5000);
        if (paidErr) {
            console.error('Paid payslips fetch error:', paidErr);
            throw paidErr;
        }
        document.getElementById('userPendingPayslips').textContent = pending.length;
        document.getElementById('userPaidPayslips').textContent = paid.length;
        let totalEarned = historyData.reduce((sum, p) => sum + (p.totals?.grandTotal || 0), 0) + paid.reduce((sum, p) => sum + (p.payslip_data?.totals?.grandTotal || 0), 0);
        document.getElementById('userTotalEarned').textContent = `$${totalEarned.toFixed(2)}`;
        console.log('User stats updated:', { pending: pending.length, paid: paid.length, totalEarned });
    } catch (err) {
        console.error('Failed to update stats:', err);
        showToast('Failed to update stats: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function markAsPaid(payslipId) {
    try {
        const referenceInput = document.getElementById(`paymentRef-${payslipId}`);
        if (!referenceInput || !referenceInput.value) {
            showToast('Please enter a payment reference');
            return;
        }
        const reference = referenceInput.value;
        const paymentDate = new Date().toISOString();

        showLoading();
        // Update payslip in database
        const { error } = await supabase
            .from('payslips')
            .update({
                status: 'paid',
                reference: reference,
                payment_date: paymentDate
            })
            .eq('id', payslipId);

        if (error) {
            showToast('Failed to mark as paid: ' + error.message);
            return;
        }

        showToast('Payslip marked as paid!');
        // Refresh lists
        renderPendingList();
        renderPaidList();
        updateAdminStats();
    } catch (err) {
        showToast('Error marking as paid: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function downloadPayslip(payslipId) {
    try {
        showLoading();
        // Fetch payslip from database
        const { data: payslip, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('id', payslipId)
            .single();

        if (error || !payslip) {
            showToast('Failed to fetch payslip for download.');
            return;
        }

        // Prefer top-level fields, fallback to payslip_data if needed
        const employeeName = payslip.employeename || payslip.payslip_data?.employeeName || 'Payslip';

        const blob = new Blob([JSON.stringify(payslip, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${employeeName}_payslip.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Payslip downloaded!');
    } catch (err) {
        showToast('Error downloading payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

// 3. Render paid payslips from database
async function renderPaidList() {
    const paidList = document.getElementById('paidList');
    if (!paidList) {
        console.error('Paid list element not found');
        return;
    }
    
    paidList.innerHTML = '';
    try {
        showLoading();
        const { data: paidPayslips, error } = await supabase
            .from('payslips')
            .select('id, user_id, employeename, payment_date, payslip_data, submissiondate, reference, totals')
            .eq('status', 'paid')
            .order('payment_date', { ascending: false });
        
        if (error) {
            console.error('Error fetching paid payslips:', error);
            throw error;
        }

        if (!paidPayslips || paidPayslips.length === 0) {
            paidList.innerHTML = '<p>No paid payslips found.</p>';
            return;
        }

        paidPayslips.forEach((payslip) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '15px';
            
            // Format the amount safely
            const amount = payslip.totals?.grandTotal || 
                          payslip.payslip_data?.totals?.grandTotal || 
                          0;
            
            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${payslip.employeename || 'Unknown'} - $${amount.toFixed(2)}</h3>
                    <div>
                        <button class="btn btn-sm btn-info" onclick="viewPayslipDetails('${payslip.id}', 'paid')">
                            <i class="fas fa-eye"></i> Details
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="reopenPayslip('${payslip.id}')">
                            <i class="fas fa-undo"></i> Reopen
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deletePayslip('${payslip.id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="downloadPayslip('${payslip.id}', 'paid')">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
                <p><strong>Paid on:</strong> ${payslip.payment_date ? new Date(payslip.payment_date).toLocaleDateString() : 'N/A'}</p>
                <p><strong>Reference:</strong> ${payslip.reference || 'N/A'}</p>
            `;
            paidList.appendChild(card);
        });

        showToast('Paid payslips loaded successfully!');
    } catch (err) {
        console.error('Failed to load paid payslips:', err);
        showToast('Failed to load paid payslips: ' + err.message);
    } finally {
        hideLoading();
    }
}
// Enhanced pending list with reject option
async function renderPendingList() {
    const pendingList = document.getElementById('pendingList');
    pendingList.innerHTML = '';
    try {
        showLoading();
        const { data: pendingPayslips, error } = await supabase
            .from('payslips')
            .select('id, user_id, employeename, payslip_data, submissiondate, totals')
            .eq('status', 'pending')
            .order('submissiondate', { ascending: false });
        
        if (error) throw error;

        if (!pendingPayslips || pendingPayslips.length === 0) {
            pendingList.innerHTML = '<p>No pending payslips.</p>';
            return;
        }

        pendingPayslips.forEach((payslip) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '15px';

            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${payslip.employeename || 'Unknown'} - $${(payslip.totals?.grandTotal || 0).toFixed(2)}</h3>
                    <div>
                        <button class="btn btn-sm btn-info" onclick="viewPayslipDetails('${payslip.id}', 'pending')">
                            <i class="fas fa-eye"></i> Details
                        </button>
                        <button class="btn btn-sm btn-success" onclick="markAsPaid('${payslip.id}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="rejectPayslip('${payslip.id}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </div>
                <p><strong>Submitted:</strong> ${new Date(payslip.submissiondate).toLocaleDateString()}</p>
                <div class="form-group">
                    <label class="form-label">Payment Reference</label>
                    <input type="text" class="form-control" id="paymentRef-${payslip.id}" placeholder="Enter payment reference">
                </div>
                <div class="form-group">
                    <label class="form-label">Notes (optional)</label>
                    <textarea class="form-control" id="notes-${payslip.id}" placeholder="Add notes about this payment"></textarea>
                </div>
            `;
            pendingList.appendChild(card);
        });
    } catch (err) {
        showToast('Failed to load pending payslips: ' + err.message);
    } finally {
        hideLoading();
    }
}


// Enhanced markAsPaid function with notes
async function markAsPaid(payslipId) {
    try {
        const referenceInput = document.getElementById(`paymentRef-${payslipId}`);
        const notesInput = document.getElementById(`notes-${payslipId}`);
        
        if (!referenceInput || !referenceInput.value) {
            showToast('Please enter a payment reference');
            return;
        }
        
        const reference = referenceInput.value;
        const notes = notesInput ? notesInput.value : '';
        const paymentDate = new Date().toISOString();

        showLoading();
        
        // Update payslip in database
        const { error } = await supabase
            .from('payslips')
            .update({
                status: 'paid',
                reference: reference,
                payment_date: paymentDate,
                total_amount: parseFloat(document.getElementById(`total-${payslipId}`)?.value) || 0
            })
            .eq('id', payslipId);

        if (error) throw error;

        // Log admin action with notes
        await supabase
            .from('admin_actions')
            .insert({
                admin_id: currentUser,
                action_type: 'approve_payslip',
                target_user_id: payslipId, // This should be the user_id from payslip
                details: { 
                    payslip_id: payslipId, 
                    reference: reference,
                    notes: notes,
                    timestamp: new Date().toISOString() 
                }
            });

        showToast('Payslip approved and marked as paid!');
        
        // Refresh lists
        renderPendingList();
        renderPaidList();
        updateAdminStats();
    } catch (err) {
        showToast('Error marking as paid: ' + err.message);
    } finally {
        hideLoading();
    }
}