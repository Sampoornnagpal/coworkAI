import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function Login() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/admin/teams')
      .then(r => { 
        setTeams(r.data); 
        if (r.data.length) setTeamId(r.data[0].id); 
      })
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault(); 
    setError(''); 
    setLoading(true);
    try {
      if (isSignup) {
        await signup(email, password, name, Number(teamId));
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err) { 
      setError(err.response?.data?.detail || 'Authentication failed'); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-6 relative bg-background z-0 overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <motion.div
          className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-3xl"
          animate={{ y: [0, 30, 0], scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, repeatType: 'reverse', duration: 8, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-3xl"
          animate={{ y: [0, -30, 0], scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, repeatType: 'reverse', duration: 8, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      {/* Brand Header */}
      <motion.header
        className="mb-8 flex items-center gap-3 transition-transform hover:scale-[1.02] cursor-default"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="w-12 h-12 bg-primary-light rounded-xl flex items-center justify-center">
          <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">
          AI Cowork
        </h1>
      </motion.header>

      {/* Main Login Card */}
      <motion.main
        className="w-full max-w-[440px]"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.15 }}
      >
        <div className="bg-surface border border-border rounded-xl p-8 flex flex-col gap-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.05)]">
          {/* Welcome Text */}
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-semibold text-text-primary mb-1">
              {isSignup ? 'Create Account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-text-secondary">
              {isSignup ? 'Set up your workspace profile' : 'Enter your credentials to access your workspace'}
            </p>
          </div>

          {/* Error Message */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                className="p-3 bg-red-50 border border-red-200 text-danger rounded-lg text-sm"
                initial={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 0 }}
                exit={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Login Form */}
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <AnimatePresence mode="wait">
              <motion.div
                key={isSignup ? 'signup-fields' : 'login-fields'}
                className="flex flex-col gap-4"
                initial={{ opacity: 0, x: isSignup ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isSignup ? -20 : 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                {isSignup && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-text-primary tracking-wide" htmlFor="name">Full Name</label>
                    <input 
                      id="name" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      required 
                      placeholder="Jane Doe" 
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-text-tertiary" 
                      type="text" 
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-primary tracking-wide" htmlFor="email">Email Address</label>
                  <input 
                    id="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                    placeholder="name@company.com" 
                    className="w-full px-4 py-2.5 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-text-tertiary" 
                    type="email" 
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-text-primary tracking-wide" htmlFor="password">Password</label>
                    {!isSignup && (
                      <a className="text-xs text-primary hover:underline transition-all" href="#">Forgot password?</a>
                    )}
                  </div>
                  <input 
                    id="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                    placeholder="••••••••" 
                    className="w-full px-4 py-2.5 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-text-tertiary" 
                    type="password" 
                  />
                </div>

                {isSignup && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-text-primary tracking-wide" htmlFor="team">Select Team</label>
                    <div className="relative">
                      <select 
                        id="team" 
                        value={teamId} 
                        onChange={e => setTeamId(e.target.value)} 
                        required 
                        className="w-full appearance-none px-4 py-2.5 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                      >
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <motion.button 
              type="submit" 
              disabled={loading}
              className="mt-2 w-full bg-primary text-white font-medium py-2.5 rounded-btn hover:bg-primary-hover transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : isSignup ? 'Create Account' : 'Sign In'}
            </motion.button>
          </form>

          {/* Footer Toggle */}
          <div className="mt-2 text-center border-t border-border pt-6">
            <p className="text-sm text-text-secondary">
              {isSignup ? "Already have an account?" : "Don't have an account?"}{' '}
              <button 
                onClick={() => {setIsSignup(!isSignup); setError('');}} 
                className="text-primary font-semibold hover:underline decoration-2 underline-offset-4"
              >
                {isSignup ? 'Sign In' : 'Contact Admin or Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </motion.main>
    </div>
  );
}
