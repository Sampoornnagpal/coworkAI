import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { ChatBubbleLeftIcon, BoltIcon, UsersIcon, BuildingOfficeIcon, PlusIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const statCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 30 }
  }
};

const teamRowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({ 
    opacity: 1, x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30, delay: i * 0.05 }
  })
};

function AnimatedNumber({ value }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!value) return;
    const duration = 1000;
    const steps = 30;
    const stepTime = duration / steps;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, stepTime);
    
    return () => clearInterval(timer);
  }, [value]);

  return <>{displayValue.toLocaleString()}</>;
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [newTeam, setNewTeam] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState(null);
  const [creditRequests, setCreditRequests] = useState([]);
  const [editingLimit, setEditingLimit] = useState(null);
  const [limitValue, setLimitValue] = useState('');
  const [grantAmounts, setGrantAmounts] = useState({});
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const { user } = useAuth();

  const load = () => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {});
    if (user?.role === 'admin') {
      api.get('/admin/credit-requests').then(r => setCreditRequests(r.data)).catch(() => {});
    }
  };
  useEffect(() => { load(); }, []);

  const createTeam = async (e) => {
    e.preventDefault(); 
    if (!newTeam.trim()) return;
    setCreating(true); 
    setMsg(null);
    try { 
      await api.post('/admin/teams', { name: newTeam.trim() }); 
      setMsg({ ok: true, text: `Team "${newTeam.trim()}" created successfully` }); 
      setNewTeam(''); 
      setShowCreateTeam(false);
      load(); 
    } catch (err) { 
      setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to create team' }); 
    } finally { 
      setCreating(false); 
    }
  };

  const saveLimit = async (teamId) => {
    const val = parseInt(limitValue);
    if (isNaN(val) || val < 0) return;
    try {
      await api.put(`/admin/teams/${teamId}/limit`, { token_limit: val });
      setEditingLimit(null); setLimitValue(''); load();
    } catch (err) { setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to update limit' }); }
  };

  const reviewRequest = async (reqId, status) => {
    const granted = status === 'approved' ? parseInt(grantAmounts[reqId] || 0) : 0;
    if (status === 'approved' && (!granted || granted <= 0)) {
      setMsg({ ok: false, text: 'Enter a valid token amount to grant' });
      return;
    }
    try {
      await api.put(`/admin/credit-requests/${reqId}`, { status, granted_tokens: granted });
      setMsg({ ok: true, text: `Request ${status}` }); load();
    } catch (err) { setMsg({ ok: false, text: err.response?.data?.detail || 'Failed' }); }
  };

  if (!stats) return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh] bg-background">
      <div className="flex gap-2">
        {[0,.2,.4].map(d => <motion.div key={d} animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity, delay: d }} className="w-3 h-3 rounded-full bg-primary" />)}
      </div>
    </div>
  );

  const pendingRequests = creditRequests.filter(r => r.status === 'pending');
  const pastRequests = creditRequests.filter(r => r.status !== 'pending');
  const formatNum = (n) => typeof n === 'number' ? n.toLocaleString() : n;

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="h-[64px] shrink-0 px-6 lg:px-8 flex items-center justify-between border-b border-border bg-white z-10 sticky top-0"
      >
        <h1 className="text-lg font-semibold text-text-primary">Admin Dashboard</h1>
        {user?.role === 'admin' && (
          <motion.button 
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreateTeam(!showCreateTeam)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors shadow-sm"
          >
            <motion.div animate={showCreateTeam ? { rotate: 45 } : { rotate: 0 }} transition={{ type: 'spring', stiffness: 300 }}>
              <PlusIcon className="w-4 h-4" />
            </motion.div>
            Create Team
          </motion.button>
        )}
      </motion.header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-8 py-8 space-y-8">
        
        {/* Message */}
        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -16, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, y: -16, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={`p-4 rounded-btn text-sm font-medium flex items-center justify-between overflow-hidden shadow-sm ${msg.ok ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'}`}
            >
              <span>{msg.text}</span>
              <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create Team Form (Toggleable) */}
        <AnimatePresence>
          {showCreateTeam && user?.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 32 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="bg-white rounded-xl border border-border shadow-sm p-6">
                <h2 className="text-base font-semibold text-text-primary mb-4">Create New Team</h2>
                <form onSubmit={createTeam} className="flex gap-4">
                  <input 
                    type="text" 
                    value={newTeam} 
                    onChange={e => setNewTeam(e.target.value)} 
                    placeholder="Enter team name..." 
                    autoFocus
                    className="flex-1 px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  />
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit" 
                    disabled={creating || !newTeam.trim()} 
                    className="px-6 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => setShowCreateTeam(false)}
                    className="px-4 py-2 bg-surface text-text-secondary rounded-btn text-sm font-medium hover:bg-background border border-border transition-all"
                  >
                    Cancel
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stat Cards */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {/* Queries */}
          <motion.div variants={statCardVariants} className="bg-white rounded-xl border border-border border-l-4 border-l-primary p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-text-secondary mb-2">Total Queries</p>
                <p className="text-3xl font-bold text-text-primary"><AnimatedNumber value={stats.total_queries} /></p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center text-primary">
                <ChatBubbleLeftIcon className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
          {/* Tokens */}
          <motion.div variants={statCardVariants} className="bg-white rounded-xl border border-border border-l-4 border-l-warning p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-text-secondary mb-2">Total Tokens Used</p>
                <p className="text-3xl font-bold text-text-primary"><AnimatedNumber value={stats.total_tokens} /></p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-warning">
                <BoltIcon className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
          {/* Users */}
          <motion.div variants={statCardVariants} className="bg-white rounded-xl border border-border border-l-4 border-l-success p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-text-secondary mb-2">Active Users</p>
                <p className="text-3xl font-bold text-text-primary"><AnimatedNumber value={stats.total_users} /></p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-success">
                <UsersIcon className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
          {/* Teams */}
          <motion.div variants={statCardVariants} className="bg-white rounded-xl border border-border border-l-4 border-l-purple-500 p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-text-secondary mb-2">Active Teams</p>
                <p className="text-3xl font-bold text-text-primary"><AnimatedNumber value={stats.teams.length} /></p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                <BuildingOfficeIcon className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Teams Table */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.2 }}
          className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-border bg-surface">
            <h2 className="text-base font-semibold text-text-primary">Teams</h2>
          </div>
          {stats.teams.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-tertiary">No data yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-text-secondary uppercase tracking-wider bg-white">
                    <th className="px-6 py-4">Team Name</th>
                    <th className="px-6 py-4">Members</th>
                    <th className="px-6 py-4">Queries</th>
                    <th className="px-6 py-4">Tokens Used</th>
                    <th className="px-6 py-4 w-[250px]">Budget Limit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.teams.map((t, i) => {
                    const pct = t.token_limit > 0 ? Math.min(100, Math.round((t.monthly_tokens_used || 0) / t.token_limit * 100)) : 0;
                    const isOver = pct >= 100;
                    const progressColor = pct < 70 ? 'bg-success' : pct < 90 ? 'bg-warning' : 'bg-danger';

                    return (
                      <motion.tr
                        key={t.id}
                        custom={i}
                        variants={teamRowVariants}
                        initial="hidden"
                        animate="visible"
                        className="hover:bg-surface transition-colors cursor-default"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary-light text-primary flex items-center justify-center font-bold text-sm">
                              {t.name[0]}
                            </div>
                            <span className="text-sm font-medium text-text-primary">{t.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-text-secondary">{t.member_count}</td>
                        <td className="px-6 py-4 text-sm text-text-secondary">{formatNum(t.query_count)}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-background border border-border rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 1, delay: 0.5 + i * 0.1, type: "spring", stiffness: 100 }}
                                  className={`h-full rounded-full transition-all ${progressColor}`} 
                                />
                              </div>
                              <span className={`text-xs font-semibold ${isOver ? 'text-danger' : 'text-text-secondary'}`}>{pct}%</span>
                            </div>
                            <span className="text-[11px] text-text-tertiary">{formatNum(t.monthly_tokens_used || 0)} used</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {editingLimit === t.id ? (
                            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                              <input 
                                type="number" 
                                value={limitValue} 
                                onChange={e => setLimitValue(e.target.value)} 
                                autoFocus
                                className="w-24 px-2 py-1.5 rounded-btn border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                              />
                              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => saveLimit(t.id)} className="p-1.5 text-success hover:bg-green-50 rounded-md transition-colors" title="Save">
                                <CheckIcon className="w-4 h-4" />
                              </motion.button>
                              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setEditingLimit(null)} className="p-1.5 text-text-tertiary hover:bg-surface rounded-md transition-colors" title="Cancel">
                                <XMarkIcon className="w-4 h-4" />
                              </motion.button>
                            </motion.div>
                          ) : (
                            <div className="flex items-center justify-between group">
                              <span className="text-sm text-text-secondary">{formatNum(t.token_limit)}</span>
                              {user?.role === 'admin' && (
                                <button 
                                  onClick={() => {setEditingLimit(t.id);setLimitValue(String(t.token_limit));}} 
                                  className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Credit Requests */}
        {user?.role === 'admin' && creditRequests.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.3 }}
            className="bg-white rounded-xl border border-border shadow-sm overflow-hidden pb-4"
          >
            <div className="px-6 py-5 border-b border-border bg-surface flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">Credit Requests</h2>
              {pendingRequests.length > 0 && (
                <span className="px-2.5 py-1 bg-warning text-white text-[10px] font-bold uppercase tracking-wider rounded-badge">
                  {pendingRequests.length} pending
                </span>
              )}
            </div>

            <div className="divide-y divide-border">
              {/* Pending Requests */}
              <AnimatePresence>
                {pendingRequests.map(req => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, x: -40, height: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="px-6 py-5">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-text-primary">{req.team_name}</span>
                            <span className="text-text-tertiary">&bull;</span>
                            <span className="text-xs text-text-secondary">Requested by {req.requester_name}</span>
                            <span className="px-2 py-0.5 bg-yellow-50 text-warning border border-yellow-200 text-[10px] font-semibold rounded-badge uppercase">Pending</span>
                          </div>
                          {req.reason && <p className="text-sm text-text-secondary italic mb-2">"{req.reason}"</p>}
                          <p className="text-[11px] text-text-tertiary">{new Date(req.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 bg-surface p-2 rounded-xl border border-border">
                          <input 
                            type="number" 
                            placeholder="Tokens" 
                            value={grantAmounts[req.id] || ''} 
                            onChange={e => setGrantAmounts(p => ({...p, [req.id]: e.target.value}))}
                            className="w-24 px-3 py-1.5 rounded-btn border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" 
                          />
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => reviewRequest(req.id, 'approved')} 
                            className="px-4 py-1.5 bg-success text-white rounded-btn text-xs font-semibold hover:bg-green-700 transition-colors"
                          >
                            Approve
                          </motion.button>
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => reviewRequest(req.id, 'denied')} 
                            className="px-4 py-1.5 bg-white border border-border text-text-secondary rounded-btn text-xs font-semibold hover:bg-surface transition-colors"
                          >
                            Deny
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Past Requests */}
              {pastRequests.map(req => (
                <div key={req.id} className="px-6 py-4 opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{req.team_name}</span>
                      <span className="text-text-tertiary">&bull;</span>
                      <span className="text-xs text-text-secondary">by {req.requester_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {req.status === 'approved' && <span className="text-xs font-medium text-success">+{formatNum(req.granted_tokens)} tokens</span>}
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-badge uppercase ${
                        req.status === 'approved' ? 'bg-green-50 text-success border border-green-200' : 'bg-surface text-text-tertiary border border-border'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
