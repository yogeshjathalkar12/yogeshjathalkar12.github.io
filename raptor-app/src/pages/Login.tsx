import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/AuthContext';
import { useToast } from '../hooks/ToastContext';
import { useEffect } from 'react';

export default function Login() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) showToast(error.message, 'error');
    else navigate('/dashboard');
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  return (
    <main className="arsenal-main" style={{ maxWidth: 380, paddingTop: '6rem' }}>
      <h1 className="arsenal-hero-title" style={{ marginBottom: '1.5rem' }}>Sign In</h1>
      <div className="arsenal-card">
        <div className="arsenal-card-body">
          <div className="arsenal-field">
            <label className="arsenal-label">Email</label>
            <input className="arsenal-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="arsenal-field">
            <label className="arsenal-label">Password</label>
            <input className="arsenal-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="arsenal-btn" disabled={loading} onClick={signIn}>
            {loading ? <span className="arsenal-spinner" /> : 'Sign In →'}
          </button>
          <button className="arsenal-btn arsenal-btn-secondary" style={{ marginTop: '0.8rem' }} onClick={signInWithGoogle}>
            Continue with Google
          </button>
        </div>
      </div>
    </main>
  );
}
