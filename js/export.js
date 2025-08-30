//export.js
async function exportPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('PDF library failed to load. Please refresh the page.');
        console.error('jsPDF not available');
        return;
    }
    try {
        showLoading();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const payslip = getPayslipData();

        // Validate payslip data
        if (!payslip || !payslip.days || !Array.isArray(payslip.days)) {
            throw new Error('Invalid payslip data: Missing or invalid days array');
        }

        // Header
        doc.setFontSize(18);
        doc.text('EnzoPay Timesheet', 20, 20);
        doc.setFontSize(12);
        doc.text(`Employee: ${payslip.employeeName || 'Unknown'}`, 20, 30);
        doc.text(`Role: ${payslip.employeeRole || 'Unknown'}`, 20, 40);
        doc.text(`Hourly Rate: $${(payslip.hourlyRate || 0).toFixed(2)}`, 20, 50);
        doc.text(`KPIs: $${(payslip.bonus || 0).toFixed(2)}`, 20, 60);
        doc.text(`Include Breaks: ${payslip.includeBreaks ? 'Yes' : 'No'}`, 20, 70);

        let currentY = 80;

        // Check if autoTable is available
        if (window.jsPDF && typeof window.jsPDF.prototype.autoTable === 'function') {
            // Use autoTable for formatted table
            doc.autoTable({
                head: [['Date', 'Day Off', 'Work Hours', 'Break Hours', 'Total Hours', 'Amount']],
                body: payslip.days.map(day => [
                    day.date || 'N/A',
                    day.dayOff ? 'Yes' : 'No',
                    (day.workHours || 0).toFixed(2),
                    (day.breakHours || 0).toFixed(2),
                    (day.totalHours || 0).toFixed(2),
                    `$${(day.amount || 0).toFixed(2)}`
                ]),
                startY: currentY,
                theme: 'striped',
                headStyles: { fillColor: [22, 160, 133] },
                margin: { top: 80 }
            });
            currentY = doc.lastAutoTable.finalY + 10;
        } else {
            // Fallback: List days as plain text
            console.warn('jspdf-autotable not available, using plain text fallback');
            doc.text('Time Entries:', 20, currentY);
            currentY += 10;
            payslip.days.forEach((day, index) => {
                doc.text(
                    `${index + 1}. ${day.date || 'N/A'}: ${day.dayOff ? 'Day Off' : `${(day.workHours || 0).toFixed(2)} work hrs, ${(day.breakHours || 0).toFixed(2)} break hrs, ${(day.totalHours || 0).toFixed(2)} total hrs, $${(day.amount || 0).toFixed(2)}`}`,
                    20,
                    currentY
                );
                currentY += 10;
            });
            currentY += 10;
        }

        // Summary
        doc.text(`Total Work Hours: ${(payslip.totals?.workHours || 0).toFixed(2)}`, 20, currentY);
        doc.text(`Total Break Hours: ${(payslip.totals?.breakHours || 0).toFixed(2)}`, 20, currentY + 10);
        doc.text(`Total Hours: ${(payslip.totals?.totalHours || 0).toFixed(2)}`, 20, currentY + 20);
        doc.text(`Base Pay: $${(payslip.totals?.basePay || 0).toFixed(2)}`, 20, currentY + 30);
        doc.text(`Grand Total: $${(payslip.totals?.grandTotal || 0).toFixed(2)}`, 20, currentY + 40);

        doc.save(`EnzoPay_Timesheet_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('PDF exported successfully!');
    } catch (err) {
        console.error('Export PDF failed:', err);
        showToast('Failed to export PDF: ' + err.message);
    } finally {
        hideLoading();
    }
}

function exportCsv() {
    try {
        showLoading();
        const payslip = getPayslipData();
        const rows = [
            ['Employee', payslip.employeeName || 'Unknown'],
            ['Role', payslip.employeeRole || 'Unknown'],
            ['Hourly Rate', `$${payslip.hourlyRate?.toFixed(2) || '0.00'}`],
            ['KPIs', `$${payslip.bonus?.toFixed(2) || '0.00'}`],
            ['Include Breaks', payslip.includeBreaks ? 'Yes' : 'No'],
            [],
            ['Date', 'Day Off', 'Work Hours', 'Break Hours', 'Total Hours', 'Amount']
        ];
        payslip.days.forEach(day => {
            rows.push([
                day.date || 'N/A',
                day.dayOff ? 'Yes' : 'No',
                (day.workHours || 0).toFixed(2),
                (day.breakHours || 0).toFixed(2),
                (day.totalHours || 0).toFixed(2),
                `$${(day.amount || 0).toFixed(2)}`
            ]);
        });
        rows.push([]);
        rows.push(['Total Work Hours', (payslip.totals?.workHours || 0).toFixed(2)]);
        rows.push(['Total Break Hours', (payslip.totals?.breakHours || 0).toFixed(2)]);
        rows.push(['Total Hours', (payslip.totals?.totalHours || 0).toFixed(2)]);
        rows.push(['Base Pay', `$${(payslip.totals?.basePay || 0).toFixed(2)}`]);
        rows.push(['Grand Total', `$${(payslip.totals?.grandTotal || 0).toFixed(2)}`]);
        const csvContent = rows.map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `EnzoPay_Timesheet_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('CSV exported successfully!');
    } catch (err) {
        console.error('Export CSV failed:', err);
        showToast('Failed to export CSV: ' + err.message);
    } finally {
        hideLoading();
    }
}

function exportXlsx() {
    if (!window.XLSX) {
        showToast('XLSX library failed to load. Please refresh the page.');
        console.error('XLSX not available');
        return;
    }
    try {
        showLoading();
        const employeeName = document.getElementById("employeeName").value || "Unknown";
        let wb = XLSX.utils.book_new();
        let ws_data = [["Employee", "Date", "Day Off", "Working Hours", "Break Hours", "Total Hours", "Amount"]];

        document.querySelectorAll("#timesheetBody tr").forEach(row => {
            let date = row.cells[0].querySelector("input").value || '';
            let isDayOff = row.cells[1].querySelector("input").checked ? 'Yes' : 'No';
            let work = row.cells[2].querySelector("input").value || '0';
            let brk = row.cells[3].querySelector("input").value || '0';
            let total = row.querySelector(".totalHours").innerText;
            let amt = row.querySelector(".amount").innerText.replace('$', '');
            ws_data.push([employeeName, date, isDayOff, work, brk, total, amt]);
        });

        const totalValueElem = document.getElementById("grandTotal");
        if (totalValueElem) {
            ws_data.push(['', '', '', '', '', 'Grand Total:', totalValueElem.innerText]);
        }

        let ws = XLSX.utils.aoa_to_sheet(ws_data);
        XLSX.utils.book_append_sheet(wb, ws, "Timesheet");
        XLSX.writeFile(wb, `${employeeName}_timesheet_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('XLSX exported successfully!');
    } catch (err) {
        console.error('Export XLSX failed:', err);
        showToast('Failed to export XLSX: ' + err.message);
    } finally {
        hideLoading();
    }
}

function exportJson() {
    try {
        showLoading();
        const payslip = getPayslipData();
        const blob = new Blob([JSON.stringify(payslip, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `EnzoPay_Timesheet_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('JSON exported successfully!');
    } catch (err) {
        console.error('Export JSON failed:', err);
        showToast('Failed to export JSON: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function handleImportJson(event) {
    const file = event.target.files[0];
    if (!file) {
        showToast('No file selected for JSON import.');
        console.warn('No JSON file selected');
        return;
    }
    try {
        showLoading();
        console.log('Reading JSON file:', file.name);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                console.log('Parsed JSON data:', data);
                if (!data.days || !Array.isArray(data.days) || !data.days.every(day => day && day.date)) {
                    showToast('Invalid JSON format: Missing or invalid days array.');
                    console.warn('Invalid JSON format:', data);
                    return;
                }
                document.getElementById('timesheetBody').innerHTML = '';
                data.days.forEach(day => {
                    addDay(day.date, day.workHours || 0, day.breakHours || 0, day.dayOff || false);
                });

                updateRowAndTotals();
                saveDraft();
                showToast('JSON imported successfully!');
                console.log('JSON imported successfully:', data);
            } catch (err) {
                console.error('JSON parse failed:', err);
                showToast('Failed to parse JSON: ' + err.message);
            } finally {
                hideLoading();
            }
        };
        reader.onerror = (err) => {
            console.error('File read error:', err);
            showToast('Failed to read JSON file: ' + err.message);
            hideLoading();
        };
        reader.readAsText(file);
    } catch (err) {
        console.error('JSON import error:', err);
        showToast('Failed to import JSON: ' + err.message);
        hideLoading();
    }
}

function handleUploadInsightful(e) {
    const file = e.target.files[0];
    if (!file) {
        showToast('No file selected for Insightful upload.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const csv = event.target.result;
            const lines = csv.split('\n');

            document.getElementById('timesheetBody').innerHTML = '';

            let employeeNameIndex = -1;
            let dateIndex = -1;
            let workTimeIndex = -1;
            let breakTimeIndex = -1;

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            employeeNameIndex = headers.indexOf('employee name');
            dateIndex = headers.indexOf('date');
            workTimeIndex = headers.indexOf('work time [h]');
            breakTimeIndex = headers.indexOf('break time [h]');

            if (dateIndex === -1 || workTimeIndex === -1) {
                showToast('CSV must contain "Date" and "Work Time [h]" columns');
                return;
            }

            if (employeeNameIndex !== -1 && lines.length > 1) {
                const firstDataRow = lines[1].split(',');
                if (firstDataRow.length > employeeNameIndex) {
                    const employeeName = firstDataRow[employeeNameIndex].trim();
                    if (employeeName) {
                        document.getElementById('employeeName').value = employeeName;
                    }
                }
            }

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;

                const cells = lines[i].split(',');
                if (cells.length <= Math.max(dateIndex, workTimeIndex)) continue;

                const dateStr = cells[dateIndex].trim();
                const workTimeStr = cells[workTimeIndex].trim();
                const breakTimeStr = breakTimeIndex !== -1 && cells.length > breakTimeIndex ? cells[breakTimeIndex].trim() : '';

                if (!dateStr) continue;

                let dateObj;
                const dateParts = dateStr.split('-');
                if (dateParts.length === 3) {
                    const day = parseInt(dateParts[0]);
                    const monthStr = dateParts[1].toLowerCase();
                    let year = parseInt(dateParts[2]);
                    if (year < 100) year = 2000 + year;
                    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    const month = monthNames.findIndex(m => m === monthStr.substring(0, 3));
                    if (month !== -1) {
                        dateObj = new Date(year, month, day);
                    }
                }
                if (!dateObj || isNaN(dateObj.getTime())) {
                    dateObj = new Date(dateStr);
                }
                if (!dateObj || isNaN(dateObj.getTime())) {
                    console.warn('Invalid date:', dateStr);
                    continue;
                }
                const formattedDate = dateObj.toISOString().split('T')[0];
                
                let workHours = 0;
                if (workTimeStr.includes(':')) {
                    const [hours, minutes] = workTimeStr.split(':').map(part => parseInt(part) || 0);
                    workHours = hours + (minutes / 60);
                } else {
                    workHours = parseFloat(workTimeStr) || 0;
                }

                let breakHours = 1.00; // Default break time
                if (breakTimeStr) {
                    breakHours = parseTimeStringToHours(breakTimeStr);
                }

                addDay(formattedDate, workHours, breakHours, false);
            }

            updateRowAndTotals();
            saveDraft();
            showToast('Insightful data uploaded successfully!');
        } catch (error) {
            showToast('Error processing Insightful CSV: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Helper function to parse time strings like "8:16AM" to hours
function parseTimeStringToHours(timeStr) {
    if (!timeStr) return 0;
    
    // Remove any spaces and convert to uppercase for consistent parsing
    const cleanTime = timeStr.replace(/\s+/g, '').toUpperCase();
    
    // Handle numeric values (already in hours)
    if (!isNaN(cleanTime)) {
        return parseFloat(cleanTime);
    }
    
    // Handle time format like "8:16AM"
    const timePattern = /^(\d{1,2}):(\d{2}):(\d{2})(AM|PM|)$/;
    const match = cleanTime.match(timePattern);
    
    if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const period = match[3];
        
        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) {
            hours += 12;
        } else if ((period === 'AM' ||period === '') && hours === 12) {
            hours = 0;
        }
        
        return hours + (minutes / 60) + (seconds / 3600);
    }
    
    // Handle colon format without AM/PM (assume 24-hour format)
    if (cleanTime.includes(':')) {
        const [hours, minutes] = cleanTime.split(':').map(part => parseInt(part) || 0);
        return hours + (minutes / 60);
    }
    
    console.warn('Unrecognized time format:', timeStr);
    return 0;
}

function confirmClearAll() {
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to clear all timesheet data? This action cannot be undone.';
    document.getElementById('confirmModal').style.display = 'flex';
    
    document.getElementById('confirmAction').onclick = function() {
        document.getElementById('timesheetBody').innerHTML = '';
        updateRowAndTotals();
        saveDraft();
        document.getElementById('confirmModal').style.display = 'none';
    };
}

async function exportAllPayslips(format, type) {
    try {
        showLoading();
        
        const { data: payslips, error } = await supabase
            .from('payslips')
            .select('*')
            .eq('status', type)
            .order(type === 'paid' ? 'payment_date' : 'submission_date', { ascending: false });

        if (error) throw new Error(`Failed to fetch ${type} payslips: ${error.message}`);
        if (!payslips || payslips.length === 0) {
            showToast(`No ${type} payslips to export.`);
            return;
        }

        const payslipIds = payslips.map(p => p.id);
        const { data: allEntries } = await supabase
            .from('payslip_entries')
            .select('*')
            .in('payslip_id', payslipIds);

        const enrichedPayslips = payslips.map(p => ({
            ...p,
            days: allEntries.filter(e => e.payslip_id === p.id).map(e => ({
                date: e.date,
                dayOff: e.is_day_off,
                workHours: e.work_hours,
                breakHours: e.break_hours,
                totalHours: e.total_hours,
                amount: e.amount
            })),
            totals: {
                workHours: allEntries.filter(e => e.payslip_id === p.id).reduce((sum, e) => sum + (e.work_hours || 0), 0),
                breakHours: allEntries.filter(e => e.payslip_id === p.id).reduce((sum, e) => sum + (e.break_hours || 0), 0),
                totalHours: allEntries.filter(e => e.payslip_id === p.id).reduce((sum, e) => sum + (e.total_hours || 0), 0),
                basePay: allEntries.filter(e => e.payslip_id === p.id).reduce((sum, e) => sum + (e.amount || 0), 0),
                grandTotal: allEntries.filter(e => e.payslip_id === p.id).reduce((sum, e) => sum + (e.amount || 0), 0) + (p.bonus || 0)
            }
        }));

        if (format === 'pdf') {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                showToast('PDF library failed to load. Please refresh the page.');
                console.error('jsPDF not available');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Title
            doc.setFontSize(18);
            doc.text(`EnzoPay ${type.charAt(0).toUpperCase() + type.slice(1)} Payslips`, 20, 20);
            doc.setFontSize(12);
            
            let currentY = 30;
            let pageNumber = 1;

            enrichedPayslips.forEach((payslip, index) => {
                // Add new page for each payslip after the first one
                if (index > 0) {
                    doc.addPage();
                    pageNumber++;
                    currentY = 20;
                }

                // Payslip header
                doc.setFontSize(14);
                doc.text(`Payslip #${payslip.id}`, 20, currentY);
                currentY += 10;
                
                doc.setFontSize(12);
                doc.text(`Employee: ${payslip.employee_name || 'Unknown'}`, 20, currentY);
                currentY += 8;
                doc.text(`Role: ${payslip.employee_role || 'Unknown'}`, 20, currentY);
                currentY += 8;
                doc.text(`Hourly Rate: $${(payslip.hourly_rate || 0).toFixed(2)}`, 20, currentY);
                currentY += 8;
                doc.text(`KPIs: $${(payslip.bonus || 0).toFixed(2)}`, 20, currentY);
                currentY += 8;
                doc.text(`Include Breaks: ${payslip.include_breaks ? 'Yes' : 'No'}`, 20, currentY);
                currentY += 8;
                doc.text(`Submission Date: ${payslip.submission_date ? new Date(payslip.submission_date).toLocaleDateString() : 'N/A'}`, 20, currentY);
                currentY += 8;
                
                if (type === 'paid') {
                    doc.text(`Payment Date: ${payslip.payment_date ? new Date(payslip.payment_date).toLocaleDateString() : 'N/A'}`, 20, currentY);
                    currentY += 8;
                    doc.text(`Reference: ${payslip.reference || 'N/A'}`, 20, currentY);
                    currentY += 8;
                }

                currentY += 5;

                // Check if autoTable is available
                if (window.jsPDF && typeof window.jsPDF.prototype.autoTable === 'function') {
                    // Use autoTable for formatted table
                    doc.autoTable({
                        head: [['Date', 'Day Off', 'Work Hours', 'Break Hours', 'Total Hours', 'Amount']],
                        body: payslip.days.map(day => [
                            day.date || 'N/A',
                            day.dayOff ? 'Yes' : 'No',
                            (day.workHours || 0).toFixed(2),
                            (day.breakHours || 0).toFixed(2),
                            (day.totalHours || 0).toFixed(2),
                            `$${(day.amount || 0).toFixed(2)}`
                        ]),
                        startY: currentY,
                        theme: 'striped',
                        headStyles: { fillColor: [22, 160, 133] }
                    });
                    currentY = doc.lastAutoTable.finalY + 10;
                } else {
                    // Fallback: List days as plain text
                    console.warn('jspdf-autotable not available, using plain text fallback');
                    doc.text('Time Entries:', 20, currentY);
                    currentY += 8;
                    payslip.days.forEach((day, dayIndex) => {
                        if (currentY > 270) {
                            doc.addPage();
                            currentY = 20;
                            pageNumber++;
                        }
                        doc.text(
                            `${dayIndex + 1}. ${day.date || 'N/A'}: ${day.dayOff ? 'Day Off' : `${(day.workHours || 0).toFixed(2)} work hrs, ${(day.breakHours || 0).toFixed(2)} break hrs, ${(day.totalHours || 0).toFixed(2)} total hrs, $${(day.amount || 0).toFixed(2)}`}`,
                            20,
                            currentY
                        );
                        currentY += 8;
                    });
                    currentY += 10;
                }

                // Summary
                doc.text(`Total Work Hours: ${(payslip.totals?.workHours || 0).toFixed(2)}`, 20, currentY);
                currentY += 8;
                doc.text(`Total Break Hours: ${(payslip.totals?.breakHours || 0).toFixed(2)}`, 20, currentY);
                currentY += 8;
                doc.text(`Total Hours: ${(payslip.totals?.totalHours || 0).toFixed(2)}`, 20, currentY);
                currentY += 8;
                doc.text(`Base Pay: $${(payslip.totals?.basePay || 0).toFixed(2)}`, 20, currentY);
                currentY += 8;
                doc.text(`KPIs: $${(payslip.bonus || 0).toFixed(2)}`, 20, currentY);
                currentY += 8;
                doc.text(`Grand Total: $${(payslip.totals?.grandTotal || 0).toFixed(2)}`, 20, currentY);
                currentY += 15;

                // Page footer
                doc.setFontSize(10);
                doc.text(`Page ${pageNumber}`, 180, 285, { align: 'right' });
                doc.setFontSize(12);
            });

            doc.save(`EnzoPay_${type}_Payslips_${new Date().toISOString().split('T')[0]}.pdf`);
            showToast(`${type} payslips exported as PDF successfully!`);

        } else if (format === 'csv') {
            const rows = [['Payslip ID', 'Employee', 'Role', 'Hourly Rate', 'KPIs', 'Include Breaks', 'Submission Date', 'Payment Date', 'Reference', 'Date', 'Day Off', 'Work Hours', 'Break Hours', 'Total Hours', 'Amount']];
            enrichedPayslips.forEach((p, index) => {
                p.days.forEach(day => {
                    rows.push([
                        p.id,
                        p.employee_name || 'Unknown',
                        p.employee_role || 'Unknown',
                        `$${(p.hourly_rate || 0).toFixed(2)}`,
                        `$${(p.bonus || 0).toFixed(2)}`,
                        p.include_breaks ? 'Yes' : 'No',
                        p.submission_date ? new Date(p.submission_date).toLocaleDateString() : '',
                        type === 'paid' ? (p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '') : '',
                        type === 'paid' ? (p.reference || 'N/A') : '',
                        day.date || 'N/A',
                        day.dayOff ? 'Yes' : 'No',
                        (day.workHours || 0).toFixed(2),
                        (day.breakHours || 0).toFixed(2),
                        (day.totalHours || 0).toFixed(2),
                        `$${(day.amount || 0).toFixed(2)}`
                    ]);
                });
            });
            const csvContent = rows.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `EnzoPay_${type}_Payslips_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);
            showToast(`${type} payslips exported as CSV successfully!`);
        } else if (format === 'json') {
            const data = enrichedPayslips.map(p => ({
                id: p.id,
                employeeName: p.employee_name,
                submissionDate: p.submission_date,
                paymentDate: p.payment_date,
                reference: p.reference,
                ...p
            }));
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `EnzoPay_${type}_Payslips_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
            showToast(`${type} payslips exported as JSON successfully!`);
        }
    } catch (err) {
        console.error(`Export ${type} payslips failed:`, err);
        showToast(`Failed to export ${type} payslips: ` + err.message);
    } finally {
        hideLoading();
    }
}