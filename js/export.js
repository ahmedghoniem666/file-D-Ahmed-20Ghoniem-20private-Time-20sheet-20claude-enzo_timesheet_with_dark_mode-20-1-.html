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

    try {
        showLoading();
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const reader = new FileReader();

        reader.onload = function(event) {
            try {
                if (!window.XLSX) {
                    throw new Error('Spreadsheet library failed to load.');
                }

                let workbook;
                if (ext === 'csv') {
                    const text = typeof event.target.result === 'string' ? event.target.result : new TextDecoder().decode(event.target.result);
                    workbook = XLSX.read(text, { type: 'string' });
                } else {
                    const data = new Uint8Array(event.target.result);
                    workbook = XLSX.read(data, { type: 'array' });
                }

                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

                if (!rows || rows.length === 0) {
                    showToast('The selected file is empty.');
                    return;
                }

                // Find header row and detect columns
                let headerRowIndex = 0;
                let header = rows[0].map(v => normalizeHeader(v));
                let cols = detectInsightfulColumns(header);
                for (let r = 1; (cols.dateIndex === -1 || cols.workIndex === -1) && r < Math.min(rows.length, 10); r++) {
                    const probe = rows[r].map(v => normalizeHeader(v));
                    const probeCols = detectInsightfulColumns(probe);
                    if (probeCols.dateIndex !== -1 && probeCols.workIndex !== -1) {
                        headerRowIndex = r;
                        header = probe;
                        cols = probeCols;
                        break;
                    }
                }

                if (cols.dateIndex === -1 || cols.workIndex === -1) {
                    showToast('Could not find Date and Work Hours columns.');
                    return;
                }

                const tbody = document.getElementById('timesheetBody');
                if (!tbody) {
                    showToast('Timesheet table not found.');
                    return;
                }

                // Map existing rows by date
                const existingByDate = new Map();
                tbody.querySelectorAll('tr').forEach(tr => {
                    const d = tr.querySelector('.date')?.value;
                    if (d) existingByDate.set(d, tr);
                });

                // Set employee name if present
                if (cols.employeeIndex !== -1) {
                    for (let r = headerRowIndex + 1; r < rows.length; r++) {
                        const val = rows[r]?.[cols.employeeIndex];
                        if (val && String(val).trim()) {
                            document.getElementById('employeeName').value = String(val).trim();
                            break;
                        }
                    }
                }

                let parsed = 0, created = 0, updated = 0;

                for (let r = headerRowIndex + 1; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || row.length === 0) continue;

                    const rawDate = row[cols.dateIndex];
                    const rawWork = row[cols.workIndex];
                    if ((rawDate === '' || rawDate == null) && (rawWork === '' || rawWork == null)) continue;

                    const isoDate = parseToISODate(rawDate);
                    if (!isoDate) continue;

                    const isDayOff = cols.dayOffIndex !== -1 ? toBoolean(row[cols.dayOffIndex]) : false;
                    let workHours = isDayOff ? 0 : parseToHours(rawWork);
                    let breakHours = 0;
                    if (!isDayOff && cols.breakIndex !== -1) {
                        breakHours = parseToHours(row[cols.breakIndex]);
                    } else if (!isDayOff) {
                        breakHours = 1; // default
                    }

                    if (isNaN(workHours)) workHours = 0;
                    if (isNaN(breakHours)) breakHours = 0;

                    parsed++;

                    let tr = existingByDate.get(isoDate);
                    if (!tr) {
                        addDay();
                        tr = document.querySelector('#timesheetBody tr:last-child');
                        created++;
                    } else {
                        updated++;
                    }

                    if (tr) {
                        const dateEl = tr.querySelector('.date');
                        const dayOffEl = tr.querySelector('.dayOff');
                        const workEl = tr.querySelector('.workHours');
                        const breakEl = tr.querySelector('.breakHours');
                        if (dateEl) dateEl.value = isoDate;
                        if (dayOffEl) dayOffEl.checked = !!isDayOff;
                        if (workEl) {
                            workEl.disabled = !!isDayOff;
                            workEl.value = Number(workHours).toFixed(2);
                        }
                        if (breakEl) {
                            breakEl.disabled = !!isDayOff;
                            breakEl.value = Number(breakHours).toFixed(2);
                        }
                        existingByDate.set(isoDate, tr);
                    }
                }

                updateRowAndTotals();
                saveUserData();
                showToast(`Insightful data uploaded: ${parsed} rows (${created} new, ${updated} updated).`);
            } catch (err) {
                console.error('Insightful upload failed:', err);
                showToast('Error processing file: ' + err.message);
            } finally {
                hideLoading();
                e.target.value = '';
            }
        };

        if (ext === 'csv') reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    } catch (err) {
        console.error('Upload init failed:', err);
        hideLoading();
        showToast('Failed to read file: ' + err.message);
    }
}

// Helpers for Insightful import
function normalizeHeader(v) {
    return String(v || '').toLowerCase().replace(/\s+/g, ' ').replace(/[._-]+/g, ' ').trim();
}

function detectInsightfulColumns(headerCells) {
    const join = (s) => s.join('|');
    const dateCandidates = new RegExp(join(['date','work date','day']));
    const workCandidates = new RegExp(join(['work time [h]','work time','work hours','worked hours','hours','time']));
    const breakCandidates = new RegExp(join(['break time [h]','break time','break hours','break']));
    const employeeCandidates = new RegExp(join(['employee name','employee','name','agent','user']));
    const dayOffCandidates = new RegExp(join(['day off','off','holiday','vacation']));

    let dateIndex = -1, workIndex = -1, breakIndex = -1, employeeIndex = -1, dayOffIndex = -1;
    headerCells.forEach((h, idx) => {
        if (dateIndex === -1 && dateCandidates.test(h)) dateIndex = idx;
        else if (workIndex === -1 && workCandidates.test(h)) workIndex = idx;
        else if (breakIndex === -1 && breakCandidates.test(h)) breakIndex = idx;
        else if (employeeIndex === -1 && employeeCandidates.test(h)) employeeIndex = idx;
        else if (dayOffIndex === -1 && dayOffCandidates.test(h)) dayOffIndex = idx;
    });
    return { dateIndex, workIndex, breakIndex, employeeIndex, dayOffIndex };
}

function parseToISODate(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
        // Excel serial date
        const millis = Math.round((value - 25569) * 86400 * 1000);
        const d = new Date(millis);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (!s) return null;
    // Try standard parse
    const d1 = new Date(s);
    if (!isNaN(d1.getTime())) return d1.toISOString().slice(0, 10);
    // Try dd.mm.yyyy or dd/mm/yyyy
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (m) {
        const dd = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10) - 1;
        const yyyy = parseInt(m[3].length === 2 ? ('20' + m[3]) : m[3], 10);
        const d = new Date(yyyy, mm, dd);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return null;
}

function parseToHours(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') {
        // If <= 1, treat as fraction of a day; else as decimal hours
        return value <= 1 ? value * 24 : value;
    }
    const s = String(value).trim();
    if (!s) return 0;
    // h:mm[:ss]
    const hm = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
    if (hm) {
        const h = parseInt(hm[1], 10) || 0;
        const m = parseInt(hm[2], 10) || 0;
        const sec = parseInt(hm[3] || '0', 10) || 0;
        return h + m / 60 + sec / 3600;
    }
    // 7h 30m or 7h or 30m
    const hms = s.match(/(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+(?:[.,]\d+)?)\s*m)?/i);
    if (hms && (hms[1] || hms[2])) {
        const h = parseFloat((hms[1] || '0').replace(',', '.')) || 0;
        const m = parseFloat((hms[2] || '0').replace(',', '.')) || 0;
        return h + m / 60;
    }
    // Decimal with comma or dot
    const num = parseFloat(s.replace(',', '.'));
    return isNaN(num) ? 0 : num;
}

function toBoolean(value) {
    if (typeof value === 'boolean') return value;
    const s = String(value || '').trim().toLowerCase();
    return ['yes','true','1','y','day off','off','holiday'].includes(s);
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