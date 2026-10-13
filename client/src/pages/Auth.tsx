import { useState, type FormEvent } from 'react';
import { api, saveAuthToken, type User } from '../api';
export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const result = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      saveAuthToken(result.token, result.user.id);
      onLogin(result.user);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in'); }
    finally { setBusy(false); }
  }
  return <div className="container" style={{ maxWidth: 460, paddingTop: 65 }}>
    <h1>{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
    <p className="muted">Your workouts and progress stay private to your account.</p>
    <form onSubmit={submit} className="card stack">
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}</button>
      <button className="btn" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Log in'}
      </button>
    </form>
  </div>;
}
