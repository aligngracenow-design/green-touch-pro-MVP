import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import { ArrowRight, ShieldCheck } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient brand glows */}
      <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(109,179,63,.16), transparent 65%)' }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(46,92,30,.20), transparent 70%)' }} />

      <div className="card w-full max-w-md relative z-10 animate-rise">
        <div className="flex flex-col items-center mb-8">
          <Logo variant="mark" size={72} className="mb-4" />
          <h1 className="text-2xl font-extrabold tracking-tight">
            GreenTouch<span className="text-brand">.Pro</span>
          </h1>
          <p className="text-muted text-xs mt-1.5 tracking-[0.2em] uppercase">Connect · Organize · Build</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="label">Email</label>
          <input className="input mb-4" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

          <label className="label">Password</label>
          <input className="input mb-5" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

          {error && <div className="text-red text-sm text-center mb-3">{error}</div>}

          <button type="submit" className="btn btn-primary w-full py-3.5 text-base" disabled={loading}>
            {loading ? 'Signing in…' : <>Sign In <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 text-muted text-xs mt-6">
          <ShieldCheck className="w-3.5 h-3.5 text-brand" />
          Secure construction operations platform
        </div>
      </div>
    </div>
  );
}
