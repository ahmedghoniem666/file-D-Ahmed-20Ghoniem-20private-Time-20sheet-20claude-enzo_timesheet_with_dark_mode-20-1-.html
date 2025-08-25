function initExportImportListeners() {
    console.log('Initializing export/import listeners');
    const exportPdfButton = document.getElementById('exportPdf');
    const exportCsvButton = document.getElementById('exportCsv');
    const exportXlsxButton = document.getElementById('exportXlsx');
    const exportJsonButton = document.getElementById('exportJson');
    const importJsonButton = document.getElementById('importJson');
    const importJsonFile = document.getElementById('importJsonFile');
    const exportPendingPdfButton = document.getElementById('exportPendingPdf');
    const exportPendingCsvButton = document.getElementById('exportPendingCsv');
    const exportPendingJsonButton = document.getElementById('exportPendingJson');
    const exportPaidPdfButton = document.getElementById('exportPaidPdf');
    const exportPaidCsvButton = document.getElementById('exportPaidCsv');
    const exportPaidJsonButton = document.getElementById('exportPaidJson');
    const uploadInsightfulButton = document.getElementById('uploadInsightful');

    if (exportPdfButton) exportPdfButton.addEventListener('click', exportPdf);
    else console.warn('Export PDF button not found');
    if (exportCsvButton) exportCsvButton.addEventListener('click', exportCsv);
    else console.warn('Export CSV button not found');
    if (exportXlsxButton) exportXlsxButton.addEventListener('click', exportXlsx);
    else console.warn('Export XLSX button not found');
    if (exportJsonButton) exportJsonButton.addEventListener('click', exportJson);
    else console.warn('Export JSON button not found');

    if (importJsonButton) {
        importJsonButton.addEventListener('click', () => {
            console.log('Import JSON button clicked');
            if (importJsonFile) {
                importJsonFile.value = ''; // Reset input so change event always fires
                importJsonFile.click();
            } else {
                console.error('Import JSON file input not found');
                showToast('Import JSON input not found.');
            }
        });
    } else {
        console.warn('Import JSON button not found');
    }

    if (importJsonFile) {
        importJsonFile.addEventListener('change', (event) => {
            console.log('Import JSON file change event triggered');
            handleImportJson(event);
            // Reset input after handling to allow re-importing the same file
            event.target.value = '';
        });
    } else {
        console.warn('Import JSON file input not found');
    }

    if (exportPendingPdfButton) exportPendingPdfButton.addEventListener('click', () => exportAllPayslips('pdf', 'pending'));
    else console.warn('Export Pending PDF button not found');
    if (exportPendingCsvButton) exportPendingCsvButton.addEventListener('click', () => exportAllPayslips('csv', 'pending'));
    else console.warn('Export Pending CSV button not found');
    if (exportPendingJsonButton) exportPendingJsonButton.addEventListener('click', () => exportAllPayslips('json', 'pending'));
    else console.warn('Export Pending JSON button not found');
    if (exportPaidPdfButton) exportPaidPdfButton.addEventListener('click', () => exportAllPayslips('pdf', 'paid'));
    else console.warn('Export Paid PDF button not found');
    if (exportPaidCsvButton) exportPaidCsvButton.addEventListener('click', () => exportAllPayslips('csv', 'paid'));
    else console.warn('Export Paid CSV button not found');
    if (exportPaidJsonButton) exportPaidJsonButton.addEventListener('click', () => exportAllPayslips('json', 'paid'));
    else console.warn('Export Paid JSON button not found');
    if (uploadInsightfulButton) uploadInsightfulButton.addEventListener('change', handleUploadInsightful);
    else console.warn('Upload Insightful input not found');
}

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
        doc.text(`Bonus: $${(payslip.bonus || 0).toFixed(2)}`, 20, 60);
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
            ['Bonus', `$${payslip.bonus?.toFixed(2) || '0.00'}`],
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

        // Add Grand Total row if you have a total value element
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
                document.getElementById('employeeName').value = data.employeeName || '';
                document.getElementById('employeeRole').value = data.employeeRole || '';
                document.getElementById('hourlyRate').value = data.hourlyRate || 0;
                document.getElementById('bonus').value = data.bonus || 0;
                document.getElementById('includeBreaks').checked = data.includeBreaks || false;
                updateRowAndTotals();
                await saveUserData();
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

            // Clear existing rows
            document.getElementById('timesheetBody').innerHTML = '';

            // Look for Employee Name, Date and Work Time [h] columns
            let employeeNameIndex = -1;
            let dateIndex = -1;
            let workTimeIndex = -1;

            // Check header row
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            employeeNameIndex = headers.indexOf('employee name');
            dateIndex = headers.indexOf('date');
            workTimeIndex = headers.indexOf('work time [h]');

            if (dateIndex === -1 || workTimeIndex === -1) {
                showToast('CSV must contain "Date" and "Work Time [h]" columns');
                return;
            }

            // Extract employee name if available
            if (employeeNameIndex !== -1 && lines.length > 1) {
                const firstDataRow = lines[1].split(',');
                if (firstDataRow.length > employeeNameIndex) {
                    const employeeName = firstDataRow[employeeNameIndex].trim();
                    if (employeeName) {
                        document.getElementById('employeeName').value = employeeName;
                    }
                }
            }

            // Process data rows
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;

                const cells = lines[i].split(',');
                if (cells.length <= Math.max(dateIndex, workTimeIndex)) continue;

                const dateStr = cells[dateIndex].trim();
                const workTimeStr = cells[workTimeIndex].trim();

                if (!dateStr) continue;

                // Parse date (handle formats like "18-Aug-25")
                let dateObj;
                const dateParts = dateStr.split('-');
                if (dateParts.length === 3) {
                    const day = parseInt(dateParts[0]);
                    const monthStr = dateParts[1].toLowerCase();
                    let year = parseInt(dateParts[2]);
                    
                    // Handle 2-digit year
                    if (year < 100) {
                        year = 2000 + year;
                    }
                    
                    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    const month = monthNames.findIndex(m => m === monthStr.substring(0, 3));
                    
                    if (month !== -1) {
                        dateObj = new Date(year, month, day);
                    }
                }
                
                // If parsing failed, try other methods
                if (!dateObj || isNaN(dateObj.getTime())) {
                    dateObj = new Date(dateStr);
                }
                
                if (!dateObj || isNaN(dateObj.getTime())) {
                    console.warn('Invalid date:', dateStr);
                    continue;
                }
                
                const formattedDate = dateObj.toISOString().split('T')[0];
                
                // Parse work time (handle formats like "8:07" meaning 8 hours and 7 minutes)
                let workHours = 0;
                if (workTimeStr.includes(':')) {
                    // Handle HH:MM format
                    const [hours, minutes] = workTimeStr.split(':').map(part => parseInt(part) || 0);
                    workHours = hours + (minutes / 60);
                } else {
                    // Handle decimal format
                    workHours = parseFloat(workTimeStr) || 0;
                }

                addDay();
                const lastRow = document.querySelector('#timesheetBody tr:last-child');
                if (lastRow) {
                    lastRow.querySelector('.date').value = formattedDate;
                    lastRow.querySelector('.workHours').value = workHours.toFixed(2);
                    lastRow.querySelector('.breakHours').value = 1.00; // Set break hours to 1 as default
                }
            }

            updateRowAndTotals();
            showToast('Insightful data uploaded successfully!');
        } catch (error) {
            showToast('Error processing Insightful CSV: ' + error.message);
        }
    };
    reader.readAsText(file);
}
async  function confirmClearAll() {
            document.getElementById('confirmMessage').textContent = 'Are you sure you want to clear all timesheet data? This action cannot be undone.';
            confirmModal.style.display = 'flex';
            
            // Set up confirmation action
            confirmActionBtn.onclick = function() {
                document.getElementById('timesheetBody').innerHTML = '';
                updateRowAndTotals();
                confirmModal.style.display = 'none';
            };
        }

async function exportAllPayslips(format, type) {
    try {
        showLoading();
        
        // Fetch payslips from Supabase
        const { data: payslips, error } = await supabase
            .from('payslips')
            .select('id, employeename, payslip_data, submissiondate, payment_date, reference')
            .eq('status', type)
            .order(type === 'paid' ? 'payment_date' : 'submissiondate', { ascending: false });

        if (error) throw new Error(`Failed to fetch ${type} payslips: ${error.message}`);
        if (!payslips || payslips.length === 0) {
            showToast(`No ${type} payslips to export.`);
            console.warn(`No ${type} payslips available for export`);
            return;
        }

        if (format === 'pdf') {
            exportPdf();
        } else if (format === 'csv') {
            const rows = [['Payslip #', 'Employee', 'Role', 'Hourly Rate', 'Bonus', 'Include Breaks', 'Submission Date', 'Payment Date', 'Reference', 'Date', 'Day Off', 'Work Hours', 'Break Hours', 'Total Hours', 'Amount']];
            payslips.forEach((payslip, index) => {
                const data = payslip.payslip_data || {};
                if (!data.days || !Array.isArray(data.days)) {
                    console.warn(`Invalid payslip skipped (ID: ${payslip.id}):`, payslip);
                    return;
                }
                data.days.forEach(day => {
                    rows.push([
                        index + 1,
                        payslip.employeename || data.employeeName || 'Unknown',
                        data.employeeRole || 'Unknown',
                        `$${(data.hourlyRate || 0).toFixed(2)}`,
                        `$${(data.bonus || 0).toFixed(2)}`,
                        data.includeBreaks ? 'Yes' : 'No',
                        new Date(payslip.submissionDate).toLocaleDateString(),
                        type === 'paid' ? new Date(payslip.payment_date).toLocaleDateString() : '',
                        type === 'paid' ? (payslip.reference || 'N/A') : '',
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
            const data = payslips.map((payslip, index) => ({
                payslip_number: index + 1,
                id: payslip.id,
                employeeName: payslip.employeename || payslip.payslip_data?.employeeName || 'Unknown',
                submissiondate: payslip.submissionDate,
                payment_date: payslip.payment_date || null,
                reference: payslip.reference || null,
                ...payslip.payslip_data
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