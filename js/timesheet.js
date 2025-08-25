//timesheet.js
let historyData = [];

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

        const { data: settings, error: settingsErr } = await timeout(supabase.from('user_settings').select('*').eq('user_id', currentUser).maybeSingle(), 5000);
        if (settingsErr && settingsErr.code !== 'PGRST116') {
            console.error('Settings fetch error:', settingsErr);
            throw settingsErr;
        }
        const defaultIncludeBreaks = settings ? settings.include_breaks_default : false;

        // Load draft from localStorage
        const draftKey = `enzopay_draft_${currentUser}`;
        const savedDraft = localStorage.getItem(draftKey);
        let draft = savedDraft ? JSON.parse(savedDraft) : { rows: [], includeBreaks: defaultIncludeBreaks };

        document.getElementById('includeBreaks').checked = draft.includeBreaks;

        const tbody = document.getElementById('timesheetBody');
        tbody.innerHTML = '';
        draft.rows.forEach(day => {
            if (day && day.date) {
                addDay(day.date, day.workHours || 0, day.breakHours || 0, day.dayOff || false);
            } else {
                console.warn('Invalid draft row:', day);
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

function saveDraft() {
    if (!currentUser) return;
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
    const draft = {
        rows,
        includeBreaks: document.getElementById('includeBreaks').checked
    };
    localStorage.setItem(`enzopay_draft_${currentUser}`, JSON.stringify(draft));
}

async function updateProfile() {
    if (!currentUser) return;
    try {
        const updates = {
            employee_name: document.getElementById('employeeName').value || '',
            employee_role: document.getElementById('employeeRole').value || '',
            hourly_rate: parseFloat(document.getElementById('hourlyRate').value) || 0,
            bonus: parseFloat(document.getElementById('bonus').value) || 0
        };
        const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser);
        if (error) throw error;
        showToast('Profile updated successfully!');
    } catch (err) {
        console.error('Failed to update profile:', err);
        showToast('Failed to update profile: ' + err.message);
    }
}

function updateLastUpdated() {
    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
}

function addDay(date = new Date().toISOString().split('T')[0], workHours = 0, breakHours = 1, isDayOff = false) {
    const tbody = document.getElementById('timesheetBody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="date" class="form-control date" value="${date}"></td>
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
        saveDraft();
    });
    tr.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
        updateRowAndTotals();
        saveDraft();
    }));
    tr.querySelector('.dayOff').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        tr.querySelector('.workHours').disabled = isChecked;
        tr.querySelector('.breakHours').disabled = isChecked;
        updateRowAndTotals();
        saveDraft();
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
    saveDraft();
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

async function submitSinglePayslip(payslipId) {
    showLoading();
    
    try {
        const submissionDate = new Date().toISOString();
        
        const { error } = await supabase
            .from('payslips')
            .update({
                status: 'pending',
                submission_date: submissionDate
            })
            .eq('id', payslipId)
            .eq('status', 'saved');
        
        if (error) throw error;
        
        renderUserHistory();
        showToast('Payslip submitted successfully! Status: Pending Approval');
        
    } catch (err) {
        console.error('Submit single payslip failed:', err);
        showToast('Failed to submit payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

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
        
        const { data: newPayslip, error } = await supabase.from('payslips').insert({
            user_id: currentUser,
            employee_name: payslip.employeeName,
            employee_role: payslip.employeeRole,
            hourly_rate: payslip.hourlyRate,
            bonus: payslip.bonus,
            include_breaks: payslip.includeBreaks,
            saved_at: savedAt,
            status: 'saved'
        }).select().single();
        
        if (error) throw error;
        
        const entries = payslip.days.map(day => ({
            payslip_id: newPayslip.id,
            date: day.date,
            is_day_off: day.dayOff,
            work_hours: day.workHours,
            break_hours: day.breakHours,
            total_hours: day.totalHours,
            amount: day.amount
        }));
        
        const { error: entriesError } = await supabase.from('payslip_entries').insert(entries);
        if (entriesError) throw entriesError;
        
        // Clear draft after saving
        document.getElementById('timesheetBody').innerHTML = '';
        updateRowAndTotals();
        saveDraft();
        
        renderUserHistory();
        
        if (!silent) showToast('Payslip saved to database successfully!');
        
    } catch (err) {
        console.error('Save history failed:', err);
        showToast('Failed to save payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function renderUserHistory() {
    const paymentHistory = document.getElementById('paymentHistory');
    paymentHistory.innerHTML = '<p>Loading history...</p>';
    
    try {
        const { data: userPayslips, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('user_id', currentUser)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const payslipIds = userPayslips.map(p => p.id);
        const { data: allEntries } = await supabase
            .from('payslip_entries')
            .select('*')
            .in('payslip_id', payslipIds);
        
        paymentHistory.innerHTML = '';
        
        if (!userPayslips || userPayslips.length === 0) {
            paymentHistory.innerHTML = '<p>No payslips found.</p>';
            return;
        }
        
        historyData = userPayslips.map(payslip => ({
            ...payslip,
            entries: allEntries.filter(e => e.payslip_id === payslip.id).sort((a, b) => new Date(a.date) - new Date(b.date))
        }));
        
        historyData.forEach((payslip) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '15px';
            
            const statusInfo = getStatusDisplay(payslip.status);
            const minDate = payslip.entries[0]?.date || 'N/A';
            const maxDate = payslip.entries[payslip.entries.length - 1]?.date || 'N/A';
            
            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${payslip.employee_name || 'Unknown'} - $${(payslip.grand_total || 0).toFixed(2)}</h3>
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
                ${payslip.saved_at ? `<p><strong>Saved:</strong> ${new Date(payslip.saved_at).toLocaleString()}</p>` : ''}
                ${payslip.submission_date ? `<p><strong>Submitted:</strong> ${new Date(payslip.submission_date).toLocaleString()}</p>` : ''}
                ${payslip.payment_date ? `<p><strong>Paid:</strong> ${new Date(payslip.payment_date).toLocaleString()}</p>` : ''}
                ${payslip.reference ? `<p><strong>Reference:</strong> ${payslip.reference}</p>` : ''}
                <p><strong>Period:</strong> ${minDate} to ${maxDate}</p>
                <p><strong>Status:</strong> <span class="badge ${statusInfo.badgeClass}">${statusInfo.displayText}</span></p>
            `;
            paymentHistory.appendChild(card);
        });
        
    } catch (err) {
        console.error('Failed to load history:', err);
        paymentHistory.innerHTML = `<p>Error loading history: ${err.message}</p>`;
    }
}

function getStatusDisplay(status) {
    switch (status) {
        case 'saved':
            return { displayText: 'Saved (Ready to Submit)', badgeClass: 'badge-warning' };
        case 'pending':
            return { displayText: 'Submitted (Pending Approval)', badgeClass: 'badge-info' };
        case 'paid':
            return { displayText: 'Submitted (Approved & Paid)', badgeClass: 'badge-success' };
        case 'rejected':
            return { displayText: 'Rejected', badgeClass: 'badge-danger' };
        default:
            return { displayText: status || 'Unknown', badgeClass: 'badge-secondary' };
    }
}

async function deleteHistoryItem(payslipId) {
    if (!confirm('Are you sure you want to delete this payslip from the database?')) {
        return;
    }
    
    showLoading();
    
    try {
        const { error } = await supabase
            .from('payslips')
            .delete()
            .eq('id', payslipId);
        
        if (error) throw error;
        
        renderUserHistory();
        
        showToast('Payslip deleted successfully!');
        
    } catch (err) {
        console.error('Delete payslip error:', err);
        showToast('Failed to delete payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function viewHistoryDetails(payslipId) {
    try {
        const { data: payslip, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('id', payslipId)
            .single();
        
        if (error) throw error;
        
        const { data: entries } = await supabase
            .from('payslip_entries')
            .select('*')
            .eq('payslip_id', payslipId)
            .order('date');
        
        const statusInfo = getStatusDisplay(payslip.status);
        const detailsContent = document.getElementById('detailsContent');
        
        if (detailsContent) {
            detailsContent.innerHTML = `
                <h3>Payslip Details</h3>
                <p><strong>Employee:</strong> ${payslip.employee_name || 'Unknown'} (${payslip.employee_role || 'Unknown'})</p>
                <p><strong>Status:</strong> <span class="badge ${statusInfo.badgeClass}">${statusInfo.displayText}</span></p>
                <p><strong>Saved:</strong> ${new Date(payslip.saved_at).toLocaleString()}</p>
                ${payslip.submission_date ? `<p><strong>Submitted:</strong> ${new Date(payslip.submission_date).toLocaleString()}</p>` : ''}
                ${payslip.payment_date ? `<p><strong>Paid:</strong> ${new Date(payslip.payment_date).toLocaleString()}</p>` : ''}
                ${payslip.reference ? `<p><strong>Reference:</strong> ${payslip.reference}</p>` : ''}
                <p><strong>Total Amount:</strong> $${(payslip.grand_total || 0).toFixed(2)}</p>
                
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
                        ${entries.map(day => `
                            <tr>
                                <td>${day.date || 'N/A'}</td>
                                <td>${day.is_day_off ? 'Yes' : 'No'}</td>
                                <td>${(day.work_hours || 0).toFixed(2)}</td>
                                <td>${(day.break_hours || 0).toFixed(2)}</td>
                                <td>${(day.total_hours || 0).toFixed(2)}</td>
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
            
            document.getElementById('detailsModal').style.display = 'flex';
        }
    } catch (err) {
        console.error('Failed to load payslip details:', err);
        showToast('Failed to load payslip details: ' + err.message);
    }
}

async function viewPayslipDetails(id, type) {
    try {
        showLoading();

        const { data: payslip, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !payslip) {
            throw new Error(`Failed to fetch ${type} payslip: ${error?.message || 'No data found'}`);
        }

        const { data: entries, error: entriesError } = await supabase
            .from('payslip_entries')
            .select('*')
            .eq('payslip_id', id)
            .order('date');

        if (entriesError) throw entriesError;

        let content = `
            <h3>Payslip Details</h3>
            <p><strong>Employee:</strong> ${payslip.employee_name} (${payslip.employee_role})</p>
            <p><strong>Hourly Rate:</strong> $${(payslip.hourly_rate || 0).toFixed(2)}</p>
            <p><strong>Bonus:</strong> $${(payslip.bonus || 0).toFixed(2)}</p>
            <p><strong>Include Breaks:</strong> ${payslip.include_breaks ? 'Yes' : 'No'}</p>
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

        entries.forEach(day => {
            content += `
                <tr>
                    <td>${day.date}</td>
                    <td>${day.is_day_off ? 'Yes' : 'No'}</td>
                    <td>${(day.work_hours || 0).toFixed(2)}</td>
                    <td>${(day.break_hours || 0).toFixed(2)}</td>
                    <td>${(day.total_hours || 0).toFixed(2)}</td>
                    <td>$${(day.amount || 0).toFixed(2)}</td>
                </tr>
            `;
        });

        content += `
                </tbody>
            </table>
            <h4 style="margin-top: 20px;">Summary</h4>
            <p><strong>Total Work Hours:</strong> ${(payslip.total_work_hours || 0).toFixed(2)}</p>
            <p><strong>Total Break Hours:</strong> ${(payslip.total_break_hours || 0).toFixed(2)}</p>
            <p><strong>Total Hours:</strong> ${(payslip.total_hours || 0).toFixed(2)}</p>
            <p><strong>Base Pay:</strong> $${(payslip.base_pay || 0).toFixed(2)}</p>
            <p><strong>Grand Total:</strong> $${(payslip.grand_total || 0).toFixed(2)}</p>
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
            document.getElementById('detailsModal').style.display = 'flex';
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
        const { data: pending, error: pendingErr } = await timeout(supabase.from('payslips').select('id').eq('user_id', currentUser).eq('status', 'pending'), 5000);
        if (pendingErr) throw pendingErr;
        const { data: paid, error: paidErr } = await timeout(supabase.from('payslips').select('grand_total').eq('user_id', currentUser).eq('status', 'paid'), 5000);
        if (paidErr) throw paidErr;
        document.getElementById('userPendingPayslips').textContent = pending.length;
        document.getElementById('userPaidPayslips').textContent = paid.length;
        const totalEarned = paid.reduce((sum, p) => sum + (p.grand_total || 0), 0);
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
        const notesInput = document.getElementById(`notes-${payslipId}`);
        
        if (!referenceInput || !referenceInput.value) {
            showToast('Please enter a payment reference');
            return;
        }
        
        const reference = referenceInput.value;
        const notes = notesInput ? notesInput.value : '';
        const paymentDate = new Date().toISOString();

        showLoading();
        
        const { error } = await supabase
            .from('payslips')
            .update({
                status: 'paid',
                reference: reference,
                payment_date: paymentDate
            })
            .eq('id', payslipId);

        if (error) throw error;

const { data: payslipData, error: fetchErr } = await supabase
  .from('payslips')
  .select('user_id')
  .eq('id', payslipId)
  .single();

if (fetchErr || !payslipData) {
  console.error('Failed to fetch payslip user_id:', fetchErr);
  showToast('Error fetching payslip details for logging.');
  // Optionally continue without logging
} else {
  await logAdminAction('approve_payslip', payslipData.user_id, {  // Use user_id here
    payslip_id: payslipId,  // Pass payslip_id in details for reference
    reference: reference,
    notes: notes,
    timestamp: new Date().toISOString()
  });
  showToast('Payslip approved and marked as paid!');
          renderPendingList();
        renderPaidList();
        updateAdminStats();
}        


        
        

    } catch (err) {
        showToast('Error marking as paid: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function downloadPayslip(payslipId) {
    try {
        showLoading();
        const { data: payslip, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('id', payslipId)
            .single();

        if (error || !payslip) {
            showToast('Failed to fetch payslip for download.');
            return;
        }

        const { data: entries } = await supabase
            .from('payslip_entries')
            .select('*')
            .eq('payslip_id', payslipId)
            .order('date');

        const exportData = {
            ...payslip,
            entries
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${payslip.employee_name || 'Payslip'}_payslip.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Payslip downloaded!');
    } catch (err) {
        showToast('Error downloading payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function renderPaidList() {
    const paidList = document.getElementById('paidList');
    if (!paidList) return;
    
    paidList.innerHTML = '';
    try {
        showLoading();
        const { data: paidPayslips, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('status', 'paid')
            .order('payment_date', { ascending: false });
        
        if (error) throw error;

        if (!paidPayslips || paidPayslips.length === 0) {
            paidList.innerHTML = '<p>No paid payslips found.</p>';
            return;
        }

        paidPayslips.forEach((payslip) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '15px';
            
            card.innerHTML = `
                <div class="card-header">
                    <h3 class="card-title">${payslip.employee_name || 'Unknown'} - $${(payslip.grand_total || 0).toFixed(2)}</h3>
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
                        <button class="btn btn-sm btn-secondary" onclick="downloadPayslip('${payslip.id}')">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
                <p><strong>Paid on:</strong> ${payslip.payment_date ? new Date(payslip.payment_date).toLocaleDateString() : 'N/A'}</p>
                <p><strong>Reference:</strong> ${payslip.reference || 'N/A'}</p>
            `;
            paidList.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load paid payslips:', err);
        showToast('Failed to load paid payslips: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function renderPendingList() {
    const pendingList = document.getElementById('pendingList');
    pendingList.innerHTML = '';
    try {
        showLoading();
        const { data: pendingPayslips, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('status', 'pending')
            .order('submission_date', { ascending: false });
        
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
                    <h3 class="card-title">${payslip.employee_name || 'Unknown'} - $${(payslip.grand_total || 0).toFixed(2)}</h3>
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
                <p><strong>Submitted:</strong> ${new Date(payslip.submission_date).toLocaleDateString()}</p>
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

async function rejectPayslip(payslipId) {
    try {
        showLoading();
        const { error } = await supabase
            .from('payslips')
            .update({ status: 'rejected' })
            .eq('id', payslipId);
        
        if (error) throw error;
        const { data: payslipData, error: fetchErr } = await supabase
            .from('payslips')
            .select('user_id')
            .eq('id', payslipId)
            .single();
        await logAdminAction('reject_payslip', payslipData.user_id, { timestamp: new Date().toISOString() });
        
        showToast('Payslip rejected successfully!');
        renderPendingList();
    } catch (err) {
        showToast('Failed to reject payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}

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
        
        const { data: payslipData, error: fetchErr } = await supabase
  .from('payslips')
  .select('user_id')
  .eq('id', payslipId)
  .single();
        await logAdminAction('reopen_payslip', payslipData.user_id, { timestamp: new Date().toISOString() });
        
        showToast('Payslip reopened successfully!');
        renderPaidList();
        renderPendingList();
    } catch (err) {
        showToast('Failed to reopen payslip: ' + err.message);
    } finally {
        hideLoading();
    }
}