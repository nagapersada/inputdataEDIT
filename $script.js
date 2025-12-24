// ==========================================
// KONEKSI DATABASE SUPABASE (TETAP)
// ==========================================
const supabaseUrl = 'https://hysjbwysizpczgcsqvuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5c2pid3lzaXpwY3pnY3NxdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MjA2MTYsImV4cCI6MjA3OTQ5NjYxNn0.sLSfXMn9htsinETKUJ5IAsZ2l774rfeaNNmB7mVQcR4';

const db = window.supabase.createClient(supabaseUrl, supabaseKey);

let allMembersCache = []; 
let diagram = null;
let growthChart = null; 
let targetChartInstance = null; // [BARU] Variabel untuk Target Chart
let memberListSortColumn = 'joinDate'; 
let memberListSortDirection = 'asc';
let memberListFilterUid = null; 

document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;

    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    if (!isLoggedIn && !path.includes('index.html') && !path.endsWith('/')) {
        window.location.href = 'index.html';
        return; 
    }

    if (path.includes('index.html') || path.endsWith('/')) {
        const loginBtn = document.getElementById('loginButton');
        if(loginBtn) loginBtn.addEventListener('click', login);
    } 
    else if (path.includes('dashboard.html') || path.includes('network.html')) {
        if (isLoggedIn) ensureFullScreen();
        
        await fetchMembersFromSupabase();

        if (path.includes('dashboard.html')) initializeDashboard();
        else if (path.includes('network.html')) initializeNetworkPage();
    }
});

// --- AMBIL DATA (SAMA SEPERTI SEBELUMNYA) ---
async function fetchMembersFromSupabase() {
    try {
        const { data, error } = await db.from('members').select('*');
        if (error) throw error;

        allMembersCache = data.map(m => {
            const rawName = m.Nama || m.nama || m.name || m.Name || "Tanpa Nama";
            const rawUid = m.UID || m.uid || m.id || "0";
            const rawUpline = m.Upline || m.upline || m.UPLINE || null;
            const rawDate = m.TanggalBergabung || m.tanggalbergabung || m.joinDate || new Date().toISOString();

            return {
                name: rawName,
                uid: String(rawUid), 
                upline: rawUpline,
                joinDate: rawDate
            };
        });
        return allMembersCache;
    } catch (error) {
        console.error(error); 
        return [];
    }
}
function loadMembers() { return allMembersCache; }

// --- FUNGSI CRUD (SAMA SEPERTI SEBELUMNYA) ---
async function addMember() {
    const name = document.getElementById('name').value.trim();
    const uid = document.getElementById('uid').value.trim();
    const upline = document.getElementById('upline').value.trim();
    const joinDateValue = document.getElementById('joinDateInput').value;

    if (!name || !uid) return showNotification("Nama & UID wajib diisi!");
    if (allMembersCache.some(m => m.uid === uid)) return showNotification("UID sudah ada!");

    const joinDate = joinDateValue ? new Date(joinDateValue).toISOString() : new Date().toISOString();
    const btn = document.getElementById('addMemberButton');
    btn.textContent = "Menyimpan...";
    btn.disabled = true;

    const { error } = await db.from('members').insert([{ nama: name, uid: uid, upline: upline || null, tanggalbergabung: joinDate }]);
    
    if (error) {
        const { error: error2 } = await db.from('members').insert([{ Nama: name, UID: uid, Upline: upline || null, TanggalBergabung: joinDate }]);
        if (error2) { showNotification("Gagal: " + error2.message); btn.disabled = false; btn.textContent = "Tambah Anggota"; return; }
    }

    showNotification("Berhasil disimpan!");
    ['name', 'uid', 'upline', 'joinDateInput'].forEach(id => document.getElementById(id).value = '');
    await fetchMembersFromSupabase();
    updateCount(); searchMembers(); renderGrowthChart(); // UpdateCount akan trigger renderTargetChart juga
    btn.textContent = "Tambah Anggota";
    btn.disabled = false;
}

async function saveEditedMember() {
    const originalUid = document.getElementById('originalUid').value;
    const newName = document.getElementById('editName').value.trim();
    const newUid = document.getElementById('editUid').value.trim();
    const newUpline = document.getElementById('editUpline').value.trim();
    const newJoinDate = document.getElementById('editJoinDate').value;
    
    const updates = { nama: newName, uid: newUid, upline: newUpline || null, tanggalbergabung: newJoinDate ? new Date(newJoinDate).toISOString() : null };
    let { error } = await db.from('members').update(updates).eq('uid', originalUid);
    
    if (error) {
         const updatesCap = { Nama: newName, UID: newUid, Upline: newUpline || null, TanggalBergabung: newJoinDate ? new Date(newJoinDate).toISOString() : null };
         const { error: error2 } = await db.from('members').update(updatesCap).eq('UID', originalUid);
         if(error2) error = error2; else error = null;
    }

    if (error) {
        showNotification("Gagal update: " + error.message);
    } else {
        if (originalUid !== newUid) {
             await db.from('members').update({ upline: newUid }).eq('upline', originalUid);
             await db.from('members').update({ Upline: newUid }).eq('Upline', originalUid);
        }
        closeEditModal();
        showNotification("Data diperbarui.");
        await fetchMembersFromSupabase();
        searchMembers(); renderGrowthChart();
    }
}

async function deleteMember(uid) {
    await db.from('members').update({ upline: null }).eq('upline', uid);
    await db.from('members').update({ Upline: null }).eq('Upline', uid);
    let { error } = await db.from('members').delete().eq('uid', uid);
    if(error) { const { error: error2 } = await db.from('members').delete().eq('UID', uid); error = error2; }

    if (error) { showNotification("Gagal hapus: " + error.message); } 
    else { showNotification("Anggota dihapus."); await fetchMembersFromSupabase(); updateCount(); searchMembers(); renderGrowthChart(); }
}

// --- FUNGSI DIAGRAM JARINGAN (TETAP) ---
function renderNetwork() {
    const $ = go.GraphObject.make;
    if (diagram) diagram.div = null;
    
    diagram = $(go.Diagram, "networkDiagram", {
        padding: new go.Margin(1000, 1000, 1000, 1000),
        layout: $(go.TreeLayout, { angle: 0, layerSpacing: 100, nodeSpacing: 10 }),
        "undoManager.isEnabled": true,
        "initialContentAlignment": go.Spot.Center
    });

    const allMembers = loadMembers();
    if (allMembers.length === 0) return;

    const focusedMemberUid = sessionStorage.getItem('focusedMemberUid');
    let membersToRender = allMembers;
    
    if (focusedMemberUid) {
        const rootMember = allMembers.find(m => m.uid === focusedMemberUid);
        if (rootMember) {
            const getDH = (list, parentUid) => {
                let d = [];
                const c = list.filter(m => m.upline === parentUid);
                for (const child of c) { d.push(child); d = d.concat(getDH(list, child.uid)); }
                return d;
            };
            membersToRender = [rootMember, ...getDH(allMembers, focusedMemberUid)];
        }
    }

    const downlineCounts = {};
    allMembers.forEach(m => downlineCounts[m.uid] = 0);
    allMembers.forEach(m => { if (m.upline && downlineCounts.hasOwnProperty(m.upline)) downlineCounts[m.upline]++; });

    diagram.nodeTemplate = $(go.Node, "Horizontal", 
        $(go.Panel, "Auto", 
            $(go.Shape, "RoundedRectangle", { strokeWidth: 1.2 }, 
                new go.Binding("stroke", "key", k => downlineCounts[k]>=5?"gold":"white"), 
                new go.Binding("fill", "key", k => downlineCounts[k]>=5?"#1a1a1a":"#111")
            ),
            $(go.TextBlock, { 
                margin: new go.Margin(4, 25, 4, 25),
                font: "bold 13px sans-serif", 
                stroke:"white" 
            }, 
            new go.Binding("text", "label"))
        ),
        $("TreeExpanderButton", { width: 18, height: 18, "ButtonBorder.fill": "white" })
    );

    diagram.linkTemplate = $(go.Link, { routing: go.Link.Orthogonal, corner: 10 }, $(go.Shape, { strokeWidth: 2, stroke: "white" }));

    const nodes = membersToRender.map(m => {
        let dateFmt = 'N/A';
        if(m.joinDate) { 
            const d = new Date(m.joinDate); 
            dateFmt = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`; 
        }
        return { key: m.uid, label: `${m.uid}/${m.name}/${dateFmt}` };
    });

    const links = membersToRender.filter(m => m.upline).map(m => ({ from: m.upline, to: m.uid }));
    diagram.model = new go.GraphLinksModel(nodes, links);
    
    if (focusedMemberUid) {
        const n = diagram.findNodeForKey(focusedMemberUid);
        if(n) { diagram.centerRect(n.actualBounds); sessionStorage.removeItem('focusedMemberUid'); }
    }
}

function downloadNetworkImage() {
    if (!diagram) { showNotification("Diagram belum dimuat."); return; }
    try {
        const img = diagram.makeImage({
            scale: 1, 
            background: "#121212", 
            maxSize: new go.Size(Infinity, Infinity),
            padding: new go.Margin(50, 50, 50, 50) 
        });
        const link = document.createElement('a');
        link.href = img.src; 
        link.download = 'struktur_jaringan_dvteam.png'; 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification("Mulai mengunduh gambar jaringan...");
    } catch (e) {
        console.error("Gagal download:", e);
        showNotification("Gagal mengunduh gambar.");
    }
}

// --- LOGIN & DASHBOARD LOGIC ---
function login() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (user === 'admin' && pass === 'dvteam123') {
        sessionStorage.setItem('isLoggedIn', 'true');
        window.location.href = 'dashboard.html';
    } else { document.getElementById('error').innerText = 'Login gagal!'; }
}
function logout() { sessionStorage.removeItem('isLoggedIn'); window.location.href = 'index.html'; }

function initializeDashboard() {
    updateCount(); // Fungsi ini juga memanggil renderTargetChart()
    renderGrowthChart();
    // [BARU] Inisialisasi Chart Target
    renderTargetChart(); 

    document.getElementById('addMemberButton').addEventListener('click', addMember);
    document.getElementById('searchButton').addEventListener('click', searchMembers);
    document.getElementById('resetButton').addEventListener('click', resetSearch);
    document.getElementById('viewNetworkButton').addEventListener('click', () => { window.location.href = 'network.html'; });
    document.getElementById('viewMemberListButton').addEventListener('click', () => showMemberList(null));
    document.getElementById('backToDashboardButton').addEventListener('click', showMainDashboard);
    setupTableSorting(); 
    document.getElementById('downloadButton').addEventListener('click', downloadCSV);
    document.getElementById('saveEditButton').addEventListener('click', saveEditedMember);
    document.getElementById('cancelEditButton').addEventListener('click', closeEditModal);
    document.getElementById('logoutButton').addEventListener('click', logout);
    
    // [BARU] Listener Broadcast
    const btnBroadcast = document.getElementById('broadcastButton');
    if(btnBroadcast) btnBroadcast.addEventListener('click', generateBroadcast);
}

function initializeNetworkPage() {
    renderNetwork();
    document.getElementById('backButton').addEventListener('click', () => { window.location.href = 'dashboard.html'; });
    document.getElementById('downloadNetworkButton').addEventListener('click', downloadNetworkImage);
}

// [MODIFIKASI] updateCount kini memanggil renderTargetChart juga
function updateCount() { 
    const el = document.getElementById('totalMembers'); 
    if (el) el.textContent = loadMembers().length; 
    renderTargetChart(); // Panggil render target setiap kali jumlah berubah
}

function searchMembers() {
    const searchTerm = document.getElementById('searchTerm').value.toLowerCase();
    const allMembers = loadMembers(); 
    const results = allMembers.filter(member => {
        return searchTerm === '' || member.name.toLowerCase().includes(searchTerm) || member.uid.toLowerCase().includes(searchTerm);
    });
    displaySearchResults(results.reverse(), allMembers);
}
function displaySearchResults(results, allMembers) {
    const container = document.getElementById('searchResultsContainer');
    if (results.length === 0) { container.innerHTML = '<p style="text-align:center; color: #888;">Tidak ada anggota ditemukan.</p>'; return; }
    let html = `<h4 style="margin-top: 20px;">Hasil (${results.length})</h4>`;
    results.forEach(member => {
        const uplineMember = allMembers.find(m => m.uid === member.upline);
        const uplineName = uplineMember ? uplineMember.name : '-';
        const downlineCount = getDownlineCount(allMembers, member.uid);
        html += `<div class="result-card"><div class="result-info"><span class="info-label">Nama:</span><span class="info-value">${member.name}</span></div><div class="result-info"><span class="info-label">UID:</span><span class="info-value">${member.uid}</span></div><div class="result-info"><span class="info-label">Upline:</span><span class="info-value">${uplineName} (${member.upline || '-'})</span></div><div class="result-info"><span class="info-label">Total Anggota:</span><span class="info-value">${downlineCount}</span></div><div class="result-actions"><button class="btn-edit" onclick="openEditModal('${member.uid}')">Edit</button><button class="btn-delete" onclick="openConfirmModal('${member.uid}')">Hapus</button><button onclick="sessionStorage.setItem('focusedMemberUid', '${member.uid}'); window.location.href='network.html';">Lihat Jaringan</button><button onclick="showMemberList('${member.uid}')">Lihat Daftar</button></div></div>`;
    });
    container.innerHTML = html;
}
function resetSearch() { document.getElementById('searchTerm').value = ''; document.getElementById('searchResultsContainer').innerHTML = ''; }
function getDownlineCount(list, parentUid) {
    const children = list.filter(m => m.upline === parentUid);
    let count = children.length; for (const child of children) count += getDownlineCount(list, child.uid); return count;
}
function showNotification(message) {
    let notification = document.getElementById('notification'); if (!notification) return;
    notification.textContent = message; notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}
function openEditModal(uid) {
    const member = loadMembers().find(m => m.uid === uid); if (!member) return;
    document.getElementById('originalUid').value = member.uid;
    document.getElementById('editName').value = member.name;
    document.getElementById('editUid').value = member.uid;
    document.getElementById('editUpline').value = member.upline || '';
    document.getElementById('editJoinDate').value = member.joinDate ? member.joinDate.split('T')[0] : '';
    document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }
function openConfirmModal(uid) {
    const modal = document.getElementById('confirmModal');
    const confirmBtn = document.getElementById('confirmDeleteButton');
    const cancelBtn = document.getElementById('cancelDeleteButton');
    modal.style.display = 'flex';
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => { deleteMember(uid); modal.style.display = 'none'; });
    cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
}
function downloadCSV() {
    const members = loadMembers(); if (members.length === 0) return showNotification("Belum ada data!");
    let csv = "Nama,UID,Upline,TanggalBergabung\n";
    members.forEach(m => { const name = `"${m.name.replace(/"/g, '""')}"`; const joinDate = m.joinDate ? m.joinDate.split('T')[0] : ''; csv += `${name},${m.uid},${m.upline || ''},${joinDate}\n`; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'data_anggota_dvteam.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}
function showMainDashboard() { document.getElementById('mainDashboardContent').style.display = 'block'; document.getElementById('memberListContainer').style.display = 'none'; }
function showMemberList(uid = null) { memberListFilterUid = uid; document.getElementById('mainDashboardContent').style.display = 'none'; document.getElementById('memberListContainer').style.display = 'block'; renderMemberList(); }
function getDownlineHierarchyFlat(list, parentUid) { let result = []; const children = list.filter(m => m.upline === parentUid); for (const child of children) { result.push(child); result = result.concat(getDownlineHierarchyFlat(list, child.uid)); } return result; }
function renderMemberList() {
    const allMembers = loadMembers(); const tbody = document.getElementById('memberListTableBody'); tbody.innerHTML = ''; 
    let membersToRender = memberListFilterUid ? [allMembers.find(m => m.uid === memberListFilterUid), ...getDownlineHierarchyFlat(allMembers, memberListFilterUid)].filter(Boolean) : [...allMembers];
    membersToRender.sort((a, b) => { let valA = a[memberListSortColumn]||'', valB = b[memberListSortColumn]||''; if (memberListSortColumn === 'joinDate') { valA = new Date(a.joinDate); valB = new Date(b.joinDate); } else { valA = valA.toLowerCase(); valB = valB.toLowerCase(); } if (valA < valB) return memberListSortDirection === 'asc' ? -1 : 1; if (valA > valB) return memberListSortDirection === 'asc' ? 1 : -1; return 0; });
    membersToRender.forEach((member, index) => { const joinDate = member.joinDate ? new Date(member.joinDate).toLocaleDateString('id-ID') : 'N/A'; tbody.innerHTML += `<tr><td>${index + 1}</td><td>${member.name}</td><td>${member.uid}</td><td>${member.upline || '-'}</td><td>${joinDate}</td></tr>`; });
}
function setupTableSorting() { document.querySelectorAll('#memberListTable th.sortable-header').forEach(header => { header.addEventListener('click', () => { const newSortColumn = header.getAttribute('data-sort'); if (newSortColumn === memberListSortColumn) memberListSortDirection = memberListSortDirection === 'asc' ? 'desc' : 'asc'; else { memberListSortColumn = newSortColumn; memberListSortDirection = 'asc'; } renderMemberList(); }); }); }
function renderGrowthChart() {
    const members = loadMembers(); const ctx = document.getElementById('growthChart').getContext('2d'); if (growthChart) growthChart.destroy(); if (members.length === 0) return;
    members.sort((a, b) => new Date(a.joinDate) - new Date(b.joinDate));
    const periods = {}; const firstDate = new Date(members[0].joinDate); const lastDate = new Date(); let currentDate = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    while (currentDate <= lastDate) { const year = currentDate.getFullYear(); const month = currentDate.getMonth() + 1; periods[`${year}-${month}-P1`] = 0; periods[`${year}-${month}-P2`] = 0; currentDate.setMonth(currentDate.getMonth() + 1); }
    members.forEach(member => { const joinDate = new Date(member.joinDate); if(!isNaN(joinDate)) { const key = `${joinDate.getFullYear()}-${joinDate.getMonth() + 1}-${joinDate.getDate() <= 15 ? 'P1' : 'P2'}`; if (periods.hasOwnProperty(key)) periods[key]++; } });
    const labels = []; const periodData = []; Object.keys(periods).forEach(key => { const [year, month, period] = key.split('-'); const monthName = new Date(year, month - 1).toLocaleString('id-ID', { month: 'short' }); labels.push(`${monthName} ${year} (${period})`); periodData.push(periods[key]); });
    growthChart = new Chart(ctx, { type: 'bar', data: { labels: labels.slice(-12), datasets: [{ label: 'Anggota Baru', data: periodData.slice(-12), backgroundColor: 'rgba(255, 215, 0, 0.7)', borderColor: 'gold', borderWidth: 1 }] }, options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { color: '#ccc'} }, x: { ticks: { color: '#ccc'} } }, plugins: { legend: { display: false } } } });
}
function ensureFullScreen() { const element = document.documentElement; if (!document.fullscreenElement && element.requestFullscreen) element.requestFullscreen().catch(err => {}); }

// ==========================================
// [BARU] FUNGSI TARGET CHART & BROADCAST
// ==========================================

function renderTargetChart() {
    const ctxElement = document.getElementById('targetChart');
    if (!ctxElement) return; // Mencegah error jika elemen belum ada

    const members = loadMembers();
    const total = members.length;
    
    // Tentukan target dinamis (misal: kelipatan 50 berikutnya)
    const nextTarget = Math.ceil((total + 1) / 50) * 50; 
    const remaining = Math.max(0, nextTarget - total);
    
    // Update Teks
    const progressText = document.getElementById('targetProgressText');
    const headerText = document.querySelector('.target-text h4');
    
    if(headerText) headerText.textContent = `Misi: Menuju ${nextTarget} Anggota`;
    if(progressText) progressText.textContent = `${total} Terkumpul (${remaining} lagi)`;

    // Render Donut Chart
    const ctx = ctxElement.getContext('2d');
    if (targetChartInstance) targetChartInstance.destroy();

    targetChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Tercapai', 'Sisa'],
            datasets: [{
                data: [total, remaining],
                backgroundColor: ['#ffd700', '#333333'], // Gold & Dark Grey
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%', 
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

function generateBroadcast() {
    const total = loadMembers().length;
    const date = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    
    // Template Motivasi Otomatis
    const text = `🔥 *UPDATE SEMANGAT DVTEAM NP* 🔥\n\n` +
                 `📅 ${date}\n` +
                 `👥 Total Pasukan: *${total} Anggota*\n\n` +
                 `"Keberhasilan tim bukan dinilai dari seberapa cepat kita berlari, tapi seberapa kuat kita saling menggandeng saat pasar sedang sulit."\n\n` +
                 `🚀 Tetap fokus pada pertumbuhan 50-100%!\n` +
                 `#DVTeamNP #SatuVisi #CryptoSuccess`;

    const broadcastArea = document.getElementById('broadcastResult');
    if(broadcastArea) {
        broadcastArea.value = text;
        document.getElementById('broadcastModal').style.display = 'flex';
    }
}

function copyBroadcast() {
    const copyText = document.getElementById("broadcastResult");
    copyText.select();
    document.execCommand("copy"); 
    showNotification("Teks berhasil disalin!");
    document.getElementById('broadcastModal').style.display = 'none';
}
