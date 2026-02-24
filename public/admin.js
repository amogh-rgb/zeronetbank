document.addEventListener('DOMContentLoaded', function() {
    const API_URL = window.location.origin;
    let currentUser = null;
    let currentSection = 'overview';
    let transactionChart = null;
    let userGrowthChart = null;

    console.log('Enhanced Admin Dashboard Loaded');

    // Show loading initially
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.style.display = 'flex';

    // Login functionality
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', adminLogin);
    }

    // Logout functionality
    const logoutBtns = document.querySelectorAll('.logoutBtn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', logout);
    });

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadDashboard());
    }

    // Navigation
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.currentTarget.dataset.section;
            switchSection(section);
        });
    });

    // Modal functionality
    const modal = document.getElementById('moneyModal');
    const modalClose = document.getElementById('modalClose');
    const confirmAddBtn = document.getElementById('confirmAddBtn');
    const confirmRemoveBtn = document.getElementById('confirmRemoveBtn');

    modalClose.addEventListener('click', closeModal);
    confirmAddBtn.addEventListener('click', () => manageMoney('add'));
    confirmRemoveBtn.addEventListener('click', () => manageMoney('remove'));

    // Close modal on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    async function adminLogin() {
        const email = document.getElementById('adminEmail').value;
        const alert = document.getElementById('alert');

        if (email !== 'zeronetpay0@gmail.com') {
            showAlert('Invalid admin email', 'error');
            return;
        }

        loadingOverlay.style.display = 'flex';
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';

        await loadDashboard();
        loadingOverlay.style.display = 'none';
    }

    function showAlert(message, type = 'error') {
        const alert = document.getElementById('alert');
        alert.className = `alert ${type} show`;
        alert.textContent = message;
        setTimeout(() => alert.classList.remove('show'), 3000);
    }

    async function loadDashboard() {
        try {
            console.log('Loading dashboard data...');

            // Load all data in parallel
            const [statsRes, usersRes, transactionsRes] = await Promise.all([
                fetch(`${API_URL}/api/admin/dashboard`),
                fetch(`${API_URL}/api/admin/users`),
                fetch(`${API_URL}/api/admin/transactions`)
            ]);

            const stats = await statsRes.json();
            const users = await usersRes.json();
            const transactions = await transactionsRes.json();

            console.log('Dashboard data loaded:', { stats, users, transactions });

            // Update stats
            if (stats.success) {
                updateStats(stats.stats);
            }

            // Update users table
            if (users.success) {
                updateUsersTable(users.users);
            }

            // Update charts
            if (transactions.success) {
                updateCharts(transactions.transactions);
            }

        } catch (error) {
            console.error('Dashboard load error:', error);
            showAlert('Failed to load dashboard data', 'error');
        }
    }

    function updateStats(stats) {
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('totalTransactions').textContent = stats.totalTransactions;
        document.getElementById('totalBalance').textContent = '$' + parseFloat(stats.totalBalance).toLocaleString();
        document.getElementById('activeUsers').textContent = stats.activeUsers;

        // Animate numbers
        animateNumbers();
    }

    function animateNumbers() {
        const statValues = document.querySelectorAll('.stat-card .value');
        statValues.forEach(value => {
            const target = parseFloat(value.textContent.replace(/[$,]/g, ''));
            if (!isNaN(target)) {
                animateValue(value, 0, target, 1000);
            }
        });
    }

    function animateValue(element, start, end, duration) {
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            const current = start + (end - start) * progress;
            element.textContent = isNaN(parseFloat(element.textContent.replace(/[$,]/g, ''))) ?
                current.toLocaleString() :
                '$' + current.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    function updateUsersTable(users) {
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${user.id.substring(0, 8)}...</td>
                <td>${user.displayName || 'N/A'}</td>
                <td>${user.email}</td>
                <td>${user.phone || 'N/A'}</td>
                <td>$${parseFloat(user.balance).toFixed(2)}</td>
                <td>${user.trustScore}</td>
                <td>${user.transactionCount}</td>
                <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                <td>
                    <div class="user-actions">
                        <button class="action-btn add" onclick="openMoneyModal('${user.id}', '${user.email}', 'add')">Add</button>
                        <button class="action-btn remove" onclick="openMoneyModal('${user.id}', '${user.email}', 'remove')">Remove</button>
                        <button class="action-btn view" onclick="viewUserTransactions('${user.id}')">View</button>
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });
    }

    function updateCharts(transactions) {
        // Prepare data for charts
        const last30Days = Array.from({length: 30}, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            return date.toISOString().split('T')[0];
        });

        const transactionData = last30Days.map(date => {
            return transactions.filter(tx =>
                tx.timestamp.startsWith(date)
            ).length;
        });

        const userGrowthData = last30Days.map((date, index) => {
            // Simulate user growth (in real app, calculate from actual data)
            return Math.floor((index + 1) * 2.5);
        });

        // Transaction Volume Chart
        if (transactionChart) transactionChart.destroy();
        const transactionCtx = document.getElementById('transactionChart').getContext('2d');
        transactionChart = new Chart(transactionCtx, {
            type: 'line',
            data: {
                labels: last30Days.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Daily Transactions',
                    data: transactionData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#e2e8f0' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#a0aec0' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    y: {
                        ticks: { color: '#a0aec0' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                }
            }
        });

        // User Growth Chart
        if (userGrowthChart) userGrowthChart.destroy();
        const userGrowthCtx = document.getElementById('userGrowthChart').getContext('2d');
        userGrowthChart = new Chart(userGrowthCtx, {
            type: 'doughnut',
            data: {
                labels: ['Active Users', 'Inactive Users'],
                datasets: [{
                    data: [
                        parseInt(document.getElementById('activeUsers').textContent) || 0,
                        (parseInt(document.getElementById('totalUsers').textContent) || 0) - (parseInt(document.getElementById('activeUsers').textContent) || 0)
                    ],
                    backgroundColor: ['#4facfe', '#667eea'],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#e2e8f0' }
                    }
                }
            }
        });
    }

    function switchSection(section) {
        currentSection = section;

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Update page title
        const titles = {
            overview: 'Dashboard Overview',
            users: 'User Management',
            transactions: 'Transaction History'
        };
        document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard Overview';

        // Here you could show/hide different sections
        // For now, we keep everything visible
    }

    // Money management functions
    window.openMoneyModal = function(userId, userEmail, action) {
        document.getElementById('userInfo').innerHTML = `
            <div style="margin-bottom: 15px; padding: 10px; background: rgba(102, 126, 234, 0.1); border-radius: 8px;">
                <strong>User:</strong> ${userEmail}<br>
                <strong>Action:</strong> ${action === 'add' ? 'Add Money' : 'Remove Money'}
            </div>
        `;

        document.getElementById('modalTitle').textContent = action === 'add' ? 'Add Money to Account' : 'Remove Money from Account';
        document.getElementById('amount').value = '';
        document.getElementById('reason').value = action === 'add' ? 'Admin credit' : 'Admin debit';

        currentUser = { id: userId, email: userEmail, action };
        modal.classList.add('show');
    };

    function closeModal() {
        modal.classList.remove('show');
        currentUser = null;
    }

    async function manageMoney(action) {
        if (!currentUser) return;

        const amount = parseFloat(document.getElementById('amount').value);
        const reason = document.getElementById('reason').value;

        if (!amount || amount <= 0) {
            showAlert('Please enter a valid amount', 'error');
            return;
        }

        if (action === 'remove') {
            // Check if user has sufficient balance (you might want to check this server-side too)
            const userRow = Array.from(document.querySelectorAll('#usersTable tbody tr')).find(row =>
                row.cells[2].textContent === currentUser.email
            );
            if (userRow) {
                const balance = parseFloat(userRow.cells[4].textContent.replace('$', ''));
                if (balance < amount) {
                    showAlert('Insufficient balance', 'error');
                    return;
                }
            }
        }

        try {
            const endpoint = action === 'add' ? '/api/admin/add-money' : '/api/admin/remove-money';
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    amount: amount,
                    reason: reason
                })
            });

            const result = await res.json();

            if (result.success) {
                showAlert(`Successfully ${action === 'add' ? 'added' : 'removed'} $${amount}`, 'success');
                closeModal();
                await loadDashboard(); // Refresh data
            } else {
                showAlert(result.message || `Failed to ${action} money`, 'error');
            }
        } catch (error) {
            console.error('Money management error:', error);
            showAlert(`Failed to ${action} money`, 'error');
        }
    }

    window.viewUserTransactions = async function(userId) {
        try {
            const res = await fetch(`${API_URL}/api/admin/user-transactions/${userId}`);
            const data = await res.json();

            if (data.success) {
                console.log('User transactions:', data.transactions);
                // You could show this in a modal or new section
                showAlert(`User has ${data.transactions.length} transactions`, 'success');
            }
        } catch (error) {
            console.error('Error fetching user transactions:', error);
        }
    };

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
