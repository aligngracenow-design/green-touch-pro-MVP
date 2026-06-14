import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HardHat } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('assignedvisionary@gmail.com');
  const [password, setPassword] = useState('demo123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(ellipse at 50% -20%, rgba(212,175,55,.08), transparent 60%), #080c18' }}>
      <div className="card w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gold flex items-center justify-center mb-4">
            <HardHat className="w-7 h-7 text-bg" />
          </div>
          <h1 className="text-2xl font-extrabold">
            Green Touch<span className="text-gold">Pro</span>
          </h1>
          <p className="text-muted text-sm mt-1">Construction Operating System</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="label">Email</label>
          <input className="input mb-4" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

          <label className="label">Password</label>
          <input className="input mb-4" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

          {error && <div className="text-red text-sm text-center mb-3">{error}</div>}

          <button type="submit" className="btn btn-primary w-full py-3.5" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-muted text-xs mt-6">
          Demo: assignedvisionary@gmail.com / demo123
        </p>
      </div>
    </div>
  );
}
