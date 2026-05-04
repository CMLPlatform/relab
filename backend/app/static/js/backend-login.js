const loginForm = document.getElementById('loginForm');

if (loginForm instanceof HTMLFormElement) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const errorDiv = document.getElementById('error');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const nextInput = document.getElementById('next');
        const loginUrl = loginForm.dataset.loginUrl;
        const redirectUrl = nextInput instanceof HTMLInputElement ? nextInput.value : loginForm.dataset.defaultNext || '/';

        if (!(emailInput instanceof HTMLInputElement) || !(passwordInput instanceof HTMLInputElement) || !loginUrl) {
            return;
        }

        const body = new URLSearchParams({
            username: emailInput.value,
            password: passwordInput.value,
        });

        if (nextInput instanceof HTMLInputElement) {
            body.set('next', nextInput.value);
        }

        try {
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body,
                credentials: 'include',
            });

            if (response.ok) {
                window.location.href = redirectUrl;
                return;
            }

            const data = await response.json();
            if (errorDiv) {
                errorDiv.textContent = data.detail || 'Login failed';
                errorDiv.hidden = false;
            }
        } catch (error) {
            if (errorDiv) {
                errorDiv.textContent = error instanceof Error ? error.message : 'An unexpected error occurred';
                errorDiv.hidden = false;
            }
        }
    });
}
