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
        showLoading();
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
        showToast('No user logged in.');
        return;
    }
    try {
        //showLoading();
        const profileUpdate = {
            employee_name: document.getElementById('employeeName').value || '',
            employee_role: document.getElementById('employeeRole').value || '',
            hourly_rate: parseFloat(document.getElementById('hourlyRate').value) || 0,
            bonus: parseFloat(document.getElementById('bonus').value) || 0
        };
        console.log('Saving profile:', profileUpdate);
        const { error: profileErr } = await timeout(supabase.from('profiles').update(profileUpdate).eq('id', currentUser), 5000);
        if (profileErr) {
            console.error('Profile update error:', profileErr);
            throw profileErr;
        }

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
            history: historyData,
            timesheet: { rows, includeBreaks: document.getElementById('includeBreaks').checked }
        };
        console.log('Saving payment data:', paymentData);
        const { error: paymentErr } = await timeout(supabase.from('payment_data').upsert({ user_id: currentUser, payment_data: paymentData }), 5000);
        if (paymentErr) {
            console.error('Payment data update error:', paymentErr);
            throw paymentErr;
        }
        updateLastUpdated();
        console.log('User data saved successfully');
        //showToast('User data saved successfully!');
    } catch (err) {
        console.error('Failed to save user data:', err);
        showToast('Failed to save user data: ' + err.message);
    } finally {
        hideLoading();
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
    showToast('Timesheet updated.');
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

async function submitPayslip() {
    showLoading();
    const payslip = getPayslipData();
    if (!payslip.employeeName || !payslip.employeeName.trim() || payslip.days.length === 0) {
        showToast('Please fill employee name and add at least one day.');
        console.warn('Invalid payslip data for submission:', payslip);
        hideLoading();
        return;
    }
    try {
        console.log('Submitting payslip:', payslip);
        const { error } = await timeout(supabase.from('payslips').insert({
            user_id: currentUser,
            employeename: payslip.employeeName,
                        employeename: payslip.employeeName, // Top-level column
                bonus: payslip.bonus,
                days: payslip.days,
                totals: payslip.totals,
                submissiondate: payslip.submissionDate,
            status: 'pending',
            payslip_data: {
                employeeName: payslip.employeeName,
                employeeRole: payslip.employeeRole,
                hourlyRate: payslip.hourlyRate,
                bonus: payslip.bonus,
                includeBreaks: payslip.includeBreaks,
                days: payslip.days,
                totals: payslip.totals,
                submissionDate: payslip.submissionDate
            }
        }), 5000);
        if (error) {
            console.error('Payslip submission error:', error.message, error.details || error);
            throw new Error(`Submission failed: ${error.message} ${error.details || ''}`);
        }
        // Save history but preserve employeeName
        const employeeName = document.getElementById('employeeName').value;
        saveHistory(true);
        document.getElementById('timesheetBody').innerHTML = '';
        document.getElementById('employeeName').value = employeeName; // Restore employeeName
        updateRowAndTotals();
        updateUserStats();
        showToast('Payslip submitted successfully!');
    } catch (err) {
        console.error('Submit failed:', err.message, err);
        showToast('Submit failed: ' + err.message);
    } finally {
        hideLoading();
    }
}

function saveHistory(silent = false) {
    showLoading();
    const payslip = getPayslipData();
    if (!payslip.days.length) {
        showToast('No timesheet data to save.');
        console.warn('No payslip data to save');
        hideLoading();
        return;
    }
    historyData.push(payslip);
    renderUserHistory();
    saveUserData();
    updateLastUpdated();
    if (!silent) showToast('History saved successfully!');
    hideLoading();
}

function renderUserHistory() {
    const paymentHistory = document.getElementById('paymentHistory');
    paymentHistory.innerHTML = '';
    if (!Array.isArray(historyData) || historyData.length === 0) {
        paymentHistory.innerHTML = '<p>No payment history found.</p>';
        console.log('No valid history data to render');
        return;
    }
    historyData.forEach((payslip, index) => {
        if (!payslip || !payslip.days || !Array.isArray(payslip.days)) {
            console.warn('Invalid payslip data at index:', index, payslip);
            return;
        }
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">Payslip #${index + 1} - ${new Date(payslip.submissionDate).toLocaleDateString()}</h3>
                <button class="btn btn-sm btn-info" onclick="viewPayslipDetails(${index}, 'history')">
                    <i class="fas fa-eye"></i> View Details
                </button>
            </div>
            <p><strong>Employee:</strong> ${payslip.employeeName || 'Unknown'} (${payslip.employeeRole || 'Unknown'})</p>
            <p><strong>Period:</strong> ${payslip.days[0]?.date || 'N/A'} to ${payslip.days[payslip.days.length - 1]?.date || 'N/A'}</p>
            <p><strong>Total Amount:</strong> $${payslip.totals?.grandTotal?.toFixed(2) || '0.00'}</p>
            <p><strong>Status:</strong> <span class="badge badge-warning">Saved</span></p>
        `;
        paymentHistory.appendChild(card);
    });
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
        const employeeName = payslip.employee_name || payslip.payslip_data?.employeeName || 'Payslip';

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