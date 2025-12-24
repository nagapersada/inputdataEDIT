const supabaseUrl = 'https://hysjbwysizpczgcsqvuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5c2pid3lzaXpwY3pnY3NxdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MjA2MTYsImV4cCI6MjA3OTQ5NjYxNn0.sLSfXMn9htsinETKUJ5IAsZ2l774rfeaNNmB7mVQcR4';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

let allMembersCache = [];
let targetChartInstance = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    updateDate();
    await fetchAndRender();
    
    document.getElementById('addMemberButton').addEventListener('click', addMember);
    document.getElementById('searchButton').addEventListener('click', searchMembers);
    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = 'index.html';
    });
});

function updateDate() {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('dateDisplay').textContent = new Date().toLocaleDateString('id-ID', options);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// --- DATA LOGIC ---
async function fetchAndRender() {
    const { data, error } = await db.from('members').select('*');
    if (error) return console.error(error);

    allMembersCache = data.map(m => ({
        name: m.nama || m.Nama || "Guest",
        uid: String(m.uid || m.UID),
        upline: m.upline || m.Upline || null,
        joinDate: m.tanggalbergabung || m.TanggalBergabung || new Date().toISOString()
    }));

    renderDashboard();
}

function renderDashboard() {
    document.getElementById('totalMembers').textContent = allMembersCache.length;
    
    // Calculate Max Depth
    const depth = calculateMaxDepth(allMembersCache);
    document.getElementById('networkDepth').textContent = `${depth} Levels`;
    
    renderTargetChart();
    renderGrowthChart();
}

function calculateMaxDepth(members) {
    let maxDepth = 0;
    const findDepth = (uid, current) => {
        maxDepth = Math.max(maxDepth, current);
        members.filter(m => m.upline === uid).forEach(child => findDepth(child.uid, current + 1));
    };
    members.filter(m => !m.upline).forEach(root => findDepth(root.uid, 1));
    return maxDepth;
}

// --- CRUD OPERATIONS ---
async function addMember() {
    const btn = document.getElementById('addMemberButton');
    const data = {
        nama: document.getElementById('name').value.trim(),
        uid: document.getElementById('uid').value.trim(),
        upline: document.getElementById('upline').value.trim() || null,
        tanggalbergabung: document.getElementById('joinDateInput').value || new Date().toISOString()
    };

    if (!data.nama || !data.uid) return showNotification("Nama & UID Wajib!");

    btn.disabled = true;
    const { error } = await db.from('members').insert([data]);
    
    if (error) showNotification("Gagal: " + error.message);
    else {
        showNotification("Anggota Elite Berhasil Ditambahkan!");
        await fetchAndRender();
        ['name', 'uid', 'upline'].forEach(id => document.getElementById(id).value = '');
    }
    btn.disabled = false;
}

// --- VISUALIZATION ---
function renderTargetChart() {
    const ctx = document.getElementById('targetChart').getContext('2d');
    const total = allMembersCache.length;
    const nextGoal = Math.ceil((total + 1) / 50) * 50;
    const percent = Math.round((total / nextGoal) * 100);
    
    document.getElementById('targetPercent').textContent = `${percent}%`;

    if (targetChartInstance) targetChartInstance.destroy();
    targetChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [total, nextGoal - total],
                backgroundColor: ['#d4af37', '#222'],
                borderWidth: 0
            }]
        },
        options: { cutout: '80%', plugins: { tooltip: { enabled: false } } }
    });
}

function showNotification(msg) {
    const el = document.getElementById('notification');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
}

// Tambahkan sisa fungsi search, delete, dan chart pertumbuhan sesuai kebutuhan...
