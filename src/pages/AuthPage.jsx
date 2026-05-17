import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormField } from '../components/UI';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [extension, setExtension] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!email || !pass) {
      setErr('Please fill in all required fields.');
      return;
    }
    if (mode === 'register' && (!name || !extension)) {
      setErr('Full name and extension are required to create a protocol profile.');
      return;
    }

    setLoading(true);
    setErr('');

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        if (data?.session) navigate('/');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            data: {
              full_name: name,
              extension,
            },
          },
        });
        if (error) throw error;
        setMode('login');
        setPass('');
        setErr('Registration successful. Please sign in.');
      }
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" />
      <div className="auth-container fade-in">
        <div className="auth-header">
          <img src="/logo.png" alt="GLT Logo" className="auth-logo" />
          <h1 className="auth-title">Dignitary Management System</h1>
        </div>

        <div className="card auth-card">
          <div className="auth-tabs">
            {['login', 'register'].map((currentMode) => (
              <button
                key={currentMode}
                onClick={() => {
                  setMode(currentMode);
                  setErr('');
                }}
                className={`auth-tab ${mode === currentMode ? 'active' : ''}`}
              >
                {currentMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <>
              <FormField label="Full Name">
                <input className="input" placeholder="John Mensah" value={name} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="Extension">
                <input className="input" placeholder="Accra Central" value={extension} onChange={(e) => setExtension(e.target.value)} />
              </FormField>
            </>
          )}

          <FormField label="Email">
            <input
              className="input"
              type="email"
              placeholder="officer@church.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </FormField>

          <FormField label="Password">
            <div className="auth-password-wrap">
              <input
                className="input"
                type={showPass ? 'text' : 'password'}
                placeholder="Enter your password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPass((value) => !value)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormField>

          {err && (
            <p className="auth-error" style={{ color: err.includes('successful') ? 'var(--success-strong)' : 'var(--danger-strong)' }}>
              {err}
            </p>
          )}

          {!isSupabaseConfigured && (
            <p className="auth-error auth-error--warning">
              Supabase is not configured. Please set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
            </p>
          )}

          <button className="btn btn-gold auth-submit-btn" onClick={submit} disabled={loading || !isSupabaseConfigured}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Protocol Profile'}
          </button>

        </div>
      </div>
    </div>
  );
}
