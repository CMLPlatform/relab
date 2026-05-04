const logoutLink = document.getElementById('logoutLink');
const logoutUrl = document.body.dataset.logoutUrl;

if (logoutLink && logoutUrl) {
    logoutLink.addEventListener('click', async (event) => {
        event.preventDefault();

        try {
            await fetch(logoutUrl, { method: 'POST', credentials: 'include' });
            window.location.reload();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    });
}
