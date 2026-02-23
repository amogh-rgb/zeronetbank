document.addEventListener('DOMContentLoaded', function() {
    const API_URL = window.location.origin;
    
    console.log('Admin page loaded');
    
    // Login button
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', adminLogin);
    }
    
    // Logout buttons
    const logoutBtns = document.querySelectorAll('.logoutBtn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', logout);
    });
    
    function adminLogin() {
        console.log('Login clicked');
        const email = document.getElementById('adminEmail').value;
        const alert = document.getElementById('alert');
        
        console.log('Email entered:', email);
        
        if (email !== 'zeronetpay0@gmail.com') {
            alert.className = 'alert show';
            alert.textContent = 'Invalid admin email';
            return;
        }
        
        console.log('Email valid, showing dashboard');
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadDashboard();
    }
    
    async function loadDashboard() {
        try {
            console.log('Loading dashboard...');
            const res = await fetch(`${API_URL}/api/admin/dashboard`);
            const data = await res.json();
            
            console.log('Dashboard data:', data);
            
            if (data.success) {
                document.getElementById('totalUsers').textContent = data.stats.totalUsers;
                document.getElementById('totalTransactions').textContent = data.stats.totalTransactions;
                document.getElementById('totalBalance').textContent = '$' + parseFloat(data.stats.totalBalance).toLocaleString();
                document.getElementById('activeUsers').textContent = data.stats.activeUsers;
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }
    
    function logout() {
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'flex';
    }
});
