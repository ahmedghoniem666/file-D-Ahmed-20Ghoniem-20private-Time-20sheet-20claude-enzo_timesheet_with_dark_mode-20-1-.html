   document.addEventListener('DOMContentLoaded', () => {
            if (typeof supabase === 'undefined') {
                document.getElementById('error').textContent = 'Failed to load Supabase client. Please try again later.';
                document.getElementById('error').classList.remove('hidden');
                return;
            }

                    const supabaseUrl = 'https://puwgsdzuqsjjtriyhrqv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1d2dzZHp1cXNqanRyaXlocnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMDM5NjMsImV4cCI6MjA3MTY3OTk2M30.GRq4wEz_8F0OhmzTHj7FfRcYMt0CzXlPBQa95p13na0'; // Replace with the correct anon key from Supabase dashboard

            const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey); // Update with anon key

// Assume supabaseClient is initialized on page load

// Listen for auth state changes (run this once on page init)
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
        console.log('Password recovery mode detected');
        // Optionally show the password form if hidden
    } else if (event === 'SIGNED_IN' && session) {
        console.log('User signed in via recovery');
    }
});

async function resetPassword() {
    // Parse hash params
    const hash = window.location.hash.substring(1); // Remove the #
    const hashParams = new URLSearchParams(hash);

    // Check if it's a recovery flow
    if (hashParams.get('type') !== 'recovery') {
        document.getElementById('error').textContent = 'Invalid or expired reset link';
        document.getElementById('error').classList.remove('hidden');
        return;
    }

    const newPassword = document.getElementById('newPassword').value;
    if (!newPassword || newPassword.length < 6) {
        document.getElementById('error').textContent = 'Password must be at least 6 characters';
        document.getElementById('error').classList.remove('hidden');
        return;
    }

    try {
        // Confirm session is active (Supabase auto-sets from hash)
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session) {
            throw new Error('No active session - invalid reset link');
        }

        // Update password
        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;

        // Optional: Clear any stored token if you were using it
        await supabaseClient.from('profiles').update({
            password_reset_token: null,
            token_expiry: null
        }).eq('id', session.user.id);

        document.getElementById('success').textContent = 'Password updated successfully! Redirecting to login...';
        document.getElementById('success').classList.remove('hidden');
        setTimeout(() => window.location.href = '/login', 2000);
    } catch (err) {
        document.getElementById('error').textContent = 'Failed to update password: ' + err.message;
        document.getElementById('error').classList.remove('hidden');
    }
}
            document.getElementById('submitReset').addEventListener('click', resetPassword);
        });