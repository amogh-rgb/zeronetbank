document.addEventListener('DOMContentLoaded', function() {
    const API_URL = window.location.origin;
    let currentUser = null;
    
    console.log('User portal loaded');
    
    // Mobile login button
    const checkMobileBtn = document.getElementById('checkMobileBtn');
    if (checkMobileBtn) {
        checkMobileBtn.addEventListener('click', checkMobile);
    }
    
    // Register button
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', registerUser);
    }
    
    // Back button
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', backToMobile);
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Check if mobile exists
    async function checkMobile() {
        const mobile = document.getElementById('mobileNumber').value;
        const alert = document.getElementById('loginAlert');
        
        if (!mobile) {
            alert.className = 'alert error show';
            alert.textContent = 'Please enter mobile number';
            return;
        }
        
        try {
            // Try to find user by mobile using phone field
            const res = await fetch(`${API_URL}/api/users/by-phone/${mobile}`);
            const data = await res.json();
            
            if (data.success) {
                // User exists - login
                currentUser = data.user;
                showDashboard();
            } else {
                // User doesn't exist - show register
                document.getElementById('regMobile').value = mobile;
                document.getElementById('mobileLogin').classList.remove('active');
                document.getElementById('registerForm').classList.add('active');
            }
        } catch (error) {
            console.error('Error:', error);
            alert.className = 'alert error show';
            alert.textContent = 'Error checking mobile number';
        }
    }
    
    // Register new user
    async function registerUser() {
        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const mobile = document.getElementById('regMobile').value;
        const alert = document.getElementById('registerAlert');
        
        if (!name || !email || !mobile) {
            alert.className = 'alert error show';
            alert.textContent = 'Please fill all fields';
            return;
        }
        
        try {
            const res = await fetch(`${API_URL}/api/users/register-web`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email,
                    mobile,
                    password: mobile
                })
            });
            
            const data = await res.json();
            
            if (data.success) {
                currentUser = data.user;
                showDashboard();
            } else {
                alert.className = 'alert error show';
                alert.textContent = data.message || 'Registration failed';
            }
        } catch (error) {
            console.error('Error:', error);
            alert.className = 'alert error show';
            alert.textContent = 'Error registering';
        }
    }
    
    function backToMobile() {
        document.getElementById('registerForm').classList.remove('active');
        document.getElementById('mobileLogin').classList.add('active');
    }
    
    function showDashboard() {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        document.getElementById('userName').textContent = currentUser.name || currentUser.displayName;
        document.getElementById('userBalance').textContent = '$' + parseFloat(currentUser.balance).toFixed(2);
        
        loadTransactions();
    }
    
    async function loadTransactions() {
        try {
            const email = currentUser.email;
            const res = await fetch(`${API_URL}/api/users/transactions/${email}`);
            const data = await res.json();
            
            if (data.success && data.transactions && data.transactions.length > 0) {
                document.getElementById('userTransactions').textContent = data.transactions.length;
                renderTransactions(data.transactions);
            } else {
                document.getElementById('userTransactions').textContent = '0';
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    }
    
    function renderTransactions(transactions) {
        const list = document.getElementById('transactionList');
        const email = currentUser.email;
        
        list.innerHTML = transactions.slice(0, 5).map(t => {
            const isCredit = t.to === email || t.type === 'CREDIT';
            const amountClass = isCredit ? 'credit' : 'debit';
            const sign = isCredit ? '+' : '-';
            
            return '<div class="transaction-item">' +
                '<div class="transaction-info">' +
                    '<h4>' + t.type + '</h4>' +
                    '<p>' + new Date(t.timestamp).toLocaleDateString() + '</p>' +
                '</div>' +
                '<div class="transaction-amount ' + amountClass + '">' +
                    sign + '$' + parseFloat(t.amount).toFixed(2) +
                '</div>' +
            '</div>';
        }).join('');
    }
    
    function logout() {
        currentUser = null;
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('mobileLogin').classList.add('active');
        document.getElementById('registerForm').classList.remove('active');
        document.getElementById('mobileNumber').value = '';
    }
});
