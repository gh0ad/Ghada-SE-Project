// Common JavaScript functions for the application

async function loadHTMLIncludes() {
    const placeholders = document.querySelectorAll('[data-include]');
    await Promise.all(Array.from(placeholders).map(async placeholder => {
        const url = placeholder.dataset.include;
        if (!url) return;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load include: ${url}`);
            placeholder.innerHTML = await response.text();
        } catch (error) {
            console.error('Include load error:', error);
        }
    }));
}

function initCommonUI() {
    const modal = document.getElementById('commonModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal();
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

function showModal(title, message, type = 'info', icon = 'ℹ️') {
    const modal = document.getElementById('commonModal');
    if (!modal) return;

    const content = modal.querySelector('.modal-content');
    const titleEl = modal.querySelector('.modal-title');
    const textEl = modal.querySelector('.modal-text');
    const iconEl = modal.querySelector('.modal-icon');

    if (!content || !titleEl || !textEl || !iconEl) return;

    content.className = 'modal-content';
    if (type !== 'info') {
        content.classList.add(`modal-${type}`);
    }

    titleEl.textContent = title;
    textEl.textContent = message;
    iconEl.textContent = icon;
    modal.classList.add('show');
}

function closeModal(modalId = 'commonModal') {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

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

    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, duration);
}

function switchTab(tabId, event) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    const selectedContent = document.getElementById(tabId);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }

    const clickedTab = event?.target || window.event?.target || document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if (clickedTab) {
        clickedTab.classList.add('active');
    }
}

async function logout(redirectUrl = '/login.html') {
    try {
        await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('authToken')}`
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        sessionStorage.clear();
        window.location.href = redirectUrl;
    }
}

function toggleDriverStatus() {
    const toggle = document.querySelector('.toggle-switch');
    if (!toggle) return;

    const isActive = toggle.classList.contains('active');
    toggle.classList.toggle('active');

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
            toggle.classList.toggle('active');
            showNotification('Failed to update status', 'error');
        } else {
            const status = !isActive ? 'Online' : 'Offline';
            showNotification(`Status updated to ${status}`, 'success');
        }
    })
    .catch(error => {
        console.error('Status update error:', error);
        toggle.classList.toggle('active');
        showNotification('Network error', 'error');
    });
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^(\+966|0)?[5][0-9]{8}$/;
    return re.test(phone);
}

document.addEventListener('DOMContentLoaded', async function() {
    await loadHTMLIncludes();
    initCommonUI();
});