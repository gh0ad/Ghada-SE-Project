// Common JavaScript functions for the application

// Modal functions
function showModal(title, message, type = 'info', icon = 'ℹ️') {
    const modal = document.getElementById('commonModal');
    if (!modal) return;

    const content = modal.querySelector('.modal-content');
    const titleEl = modal.querySelector('.modal-title');
    const textEl = modal.querySelector('.modal-text');
    const iconEl = modal.querySelector('.modal-icon');

    // Remove previous type classes
    content.className = 'modal-content';
    if (type !== 'info') {
        content.classList.add(`modal-${type}`);
    }

    titleEl.textContent = title;
    textEl.textContent = message;
    iconEl.textContent = icon;

    modal.classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('commonModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Notification functions
function showNotification(message, type = 'info', duration = 5000) {
    const container = document.querySelector('.notifications');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="close-btn" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(notification);

    // Auto remove after duration
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, duration);
}

// Tab switching
function switchTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab content
    const selectedContent = document.getElementById(tabId);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }

    // Add active class to clicked tab
    const clickedTab = document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if (clickedTab) {
        clickedTab.classList.add('active');
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('authToken')}`
            }
        });

        // Clear session storage
        sessionStorage.clear();

        // Redirect to login
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        // Force logout on client side
        sessionStorage.clear();
        window.location.href = '/login.html';
    }
}

// Status toggle for driver
function toggleDriverStatus() {
    const toggle = document.querySelector('.toggle-switch');
    const isActive = toggle.classList.contains('active');

    // Toggle UI immediately
    toggle.classList.toggle('active');

    // Send request to server
    fetch('/api/driver/status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ active: !isActive })
    })
    .then(response => response.json())
    .then(data => {
        if (!data.success) {
            // Revert UI if failed
            toggle.classList.toggle('active');
            showNotification('Failed to update status', 'error');
        } else {
            const status = !isActive ? 'Online' : 'Offline';
            showNotification(`Status updated to ${status}`, 'success');
        }
    })
    .catch(error => {
        console.error('Status update error:', error);
        // Revert UI
        toggle.classList.toggle('active');
        showNotification('Network error', 'error');
    });
}

// Form validation helpers
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^(\+966|0)?[5][0-9]{8}$/;
    return re.test(phone);
}

// Initialize common functionality
document.addEventListener('DOMContentLoaded', function() {
    // Close modal when clicking outside
    const modal = document.getElementById('commonModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    }

    // Handle escape key for modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});