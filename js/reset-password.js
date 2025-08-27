   document.addEventListener('DOMContentLoaded', () => {
            if (typeof supabase === 'undefined') {
                document.getElementById('error').textContent = 'Failed to load Supabase client. Please try again later.';
                document.getElementById('error').classList.remove('hidden');
                return;
            }

                    const supabaseUrl = 'https://puwgsdzuqsjjtriyhrqv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1d2dzZHp1cXNqanRyaXlocnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMDM5NjMsImV4cCI6MjA3MTY3OTk2M30.GRq4wEz_8F0OhmzTHj7FfRcYMt0CzXlPBQa95p13na0'; // Replace with the correct anon key from Supabase dashboard

            const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey); // Update with anon key

            async function resetPassword() {
                const urlParams = new URLSearchParams(window.location.search);
                const token = urlParams.get('token');

                if (!token) {
                    document.getElementById('error').textContent = 'Invalid or missing reset token';
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
                    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
                    if (error) throw error;

                    // Clear token in profiles
                    const { data: user, error: userError } = await supabaseClient.auth.getUser();
                    if (!userError && user.user) {
                        await supabaseClient.from('profiles').update({
                            password_reset_token: null,
                            token_expiry: null
                        }).eq('id', user.user.id);
                    }

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