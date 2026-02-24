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
            
            // Load users list
            await loadUsers();
        } catch (error) {
            console.error('Error:', error);
        }
    }
    
    async function loadUsers() {
        try {
            console.log('Loading users...');
            const res = await fetch(`${API_URL}/api/admin/users`);
            const data = await res.json();
            
            console.log('Users data:', data);
            
            const usersTable = document.getElementById('usersTable');
            if (data.success && data.users) {
                const tbody = usersTable.querySelector('tbody');
                tbody.innerHTML = '';
                
                data.users.forEach(user => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${user.id.substring(0, 8)}...</td>
                        <td>${user.email}</td>
                        <td>${user.displayName || 'N/A'}</td>
                        <td>${user.phone || 'N/A'}</td>
                        <td>$${parseFloat(user.balance).toFixed(2)}</td>
                        <td>${user.trustScore}</td>
                        <td>${user.transactionCount}</td>
                        <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    function logout() {
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'flex';
    }
});
