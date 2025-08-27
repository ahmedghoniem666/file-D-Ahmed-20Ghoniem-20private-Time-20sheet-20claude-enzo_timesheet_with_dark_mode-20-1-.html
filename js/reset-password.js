   document.addEventListener('DOMContentLoaded', () => {
            if (typeof supabase === 'undefined') {
                document.getElementById('error').textContent = 'Failed to load Supabase client. Please try again later.';
                document.getElementById('error').classList.remove('hidden');
                return;
            }

                    const supabaseUrl = 'https://puwgsdzuqsjjtriyhrqv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1d2dzZHp1cXNqanRyaXlocnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMDM5NjMsImV4cCI6MjA3MTY3OTk2M30.GRq4wEz_8F0OhmzTHj7FfRcYMt0CzXlPBQa95p13na0'; // Replace with the correct anon key from Supabase dashboard

            const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey); // Update with anon key

// On page init (after supabaseClient setup)
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event);
    if (event === 'PASSWORD_RECOVERY') {
        // Show password form if hidden
        document.getElementById('passwordForm').classList.remove('hidden'); // Assume you have a form element
    } else if (event === 'INITIAL_SESSION' && !session) {
        document.getElementById('error').textContent = 'No recovery session detected. Request a new reset link.';
        document.getElementById('error').classList.remove('hidden');
    }
});

async function resetPassword() {
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);
    const recoveryType = hashParams.get('type');



    const newPassword = document.getElementById('newPassword').value;
    if (!newPassword || newPassword.length < 6) {
        document.getElementById('error').textContent = 'Password must be at least 6 characters';
        document.getElementById('error').classList.remove('hidden');
        return;
    }

    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session) {
            throw new Error('No active session - link may be expired or invalid');
        }

        const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
        if (error) throw error;

        // Optional clear
        await supabaseClient.from('profiles').update({ password_reset_token: null, token_expiry: null }).eq('id', session.user.id);

        document.getElementById('success').textContent = 'Password updated! Redirecting...';
        document.getElementById('success').classList.remove('hidden');
        setTimeout(() => window.location.href, 2000);
    } catch (err) {
        document.getElementById('error').textContent = `Failed: ${err.message}. Link may be expired—try a new reset.`;
        document.getElementById('error').classList.remove('hidden');
    }
}
            document.getElementById('submitReset').addEventListener('click', resetPassword);

        });
