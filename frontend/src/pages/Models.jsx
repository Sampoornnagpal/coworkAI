import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { Cog8ToothIcon, ExclamationTriangleIcon, CheckCircleIcon, CpuChipIcon } from '@heroicons/react/24/outline';

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 30, delay: i * 0.06 }
  }),
};

const modelRowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({
    opacity: 1, x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30, delay: i * 0.04 }
  }),
};

export default function Models() {
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerDetails, setProviderDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [credentialsForm, setCredentialsForm] = useState({});
  const [msg, setMsg] = useState(null);

  const loadProviders = () => {
    setLoading(true);
    api.get('/models/providers')
      .then(r => setProviders(r.data.providers))
      .catch(() => setMsg({ ok: false, text: 'Failed to load providers' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const selectProvider = (providerId) => {
    setSelectedProvider(providerId);
    setDetailsLoading(true);
    setMsg(null);
    setCredentialsForm({});
    
    api.get(`/models/providers/${providerId}`)
      .then(r => {
        setProviderDetails(r.data);
        const initialForm = {};
        r.data.credentials.forEach(c => {
          if (!c.is_saved) initialForm[c.key] = '';
        });
        setCredentialsForm(initialForm);
      })
      .catch(() => setMsg({ ok: false, text: 'Failed to load provider details' }))
      .finally(() => setDetailsLoading(false));
  };

  const handleCredentialChange = (key, value) => {
    setCredentialsForm(prev => ({ ...prev, [key]: value }));
  };

  const saveCredentials = async (e) => {
    e.preventDefault();
    try {
      await api.post('/models/credentials', {
        provider: selectedProvider,
        credentials: credentialsForm
      });
      setMsg({ ok: true, text: 'Credentials saved successfully' });
      // Reload details to show updated models state
      selectProvider(selectedProvider);
      loadProviders();
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to save credentials' });
    }
  };

  const toggleModel = async (model) => {
    if (!providerDetails.all_credentials_saved) return;
    
    const endpoint = model.is_active ? '/models/deactivate' : '/models/activate';
    try {
      await api.post(endpoint, {
        provider: selectedProvider,
        model_string: model.model_string,
        display_name: model.name
      });
      setMsg({ ok: true, text: `Model ${model.is_active ? 'deactivated' : 'activated'} successfully` });
      selectProvider(selectedProvider); // refresh state
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to toggle model' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Header */}
      <motion.header 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="h-[64px] shrink-0 px-6 lg:px-8 flex items-center justify-between border-b border-border bg-white z-10 sticky top-0"
      >
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {selectedProvider && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={() => { setSelectedProvider(null); setProviderDetails(null); setMsg(null); }}
                className="mr-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </motion.button>
            )}
          </AnimatePresence>
          <h1 className="text-lg font-semibold text-text-primary">Models Management</h1>
        </div>
      </motion.header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 lg:px-8 py-8 space-y-8">
        {/* Messages */}
        <AnimatePresence>
          {msg && (
            <motion.div 
              initial={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 0 }}
              exit={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
              className={`p-4 rounded-btn text-sm font-medium flex items-center justify-between shadow-sm ${msg.ok ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'}`}
            >
              <span>{msg.text}</span>
              <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex gap-2">
              {[0,.2,.4].map(d => <div key={d} className="w-3 h-3 rounded-full bg-primary" style={{animation:'pulse-dot 1.2s infinite',animationDelay:`${d}s`}}/>)}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {!selectedProvider ? (
              /* Provider Grid */
              <motion.div
                key="providers"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
              >
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  className="mb-6"
                >
                  <h2 className="text-xl font-bold text-text-primary mb-1">AI Providers</h2>
                  <p className="text-sm text-text-secondary">Select a provider to configure credentials and activate models for your team.</p>
                </motion.div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {providers.map((p, i) => (
                    <motion.div 
                      key={p.id}
                      custom={i}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ y: -4, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.12)' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => selectProvider(p.id)}
                      className="bg-white rounded-xl border border-border p-5 hover:border-primary/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-bold text-text-primary group-hover:text-primary transition-colors">{p.name}</h3>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface text-xs font-medium border border-border">
                          <motion.div 
                            className={`w-2.5 h-2.5 rounded-full ${p.is_configured ? 'bg-success' : 'bg-text-tertiary'}`}
                            animate={p.is_configured ? { scale: [1, 1.3, 1] } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                          {p.is_configured ? 'Configured' : 'Not configured'}
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary flex items-center gap-1.5">
                        <CpuChipIcon className="w-4 h-4" />
                        {p.model_count} models available
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : detailsLoading || !providerDetails ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center py-20"
              >
                <div className="flex gap-2">
                  {[0,.2,.4].map(d => <div key={d} className="w-3 h-3 rounded-full bg-primary" style={{animation:'pulse-dot 1.2s infinite',animationDelay:`${d}s`}}/>)}
                </div>
              </motion.div>
            ) : (
              /* Provider Details View */
              <motion.div 
                key="details"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="space-y-8"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h2 className="text-2xl font-bold text-text-primary mb-1">{providerDetails.provider}</h2>
                  <p className="text-sm text-text-secondary">Configure credentials to unlock models from this provider.</p>
                </motion.div>

                {/* Credentials Section */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.15 }}
                  className="bg-white rounded-xl border border-border shadow-sm p-6"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                      <Cog8ToothIcon className="w-5 h-5 text-text-secondary" />
                      API Credentials
                    </h3>
                    <AnimatePresence>
                      {providerDetails.all_credentials_saved && (
                        <motion.span 
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-1.5 text-xs font-medium text-success bg-green-50 px-2.5 py-1 rounded-full border border-green-200"
                        >
                          <CheckCircleIcon className="w-4 h-4" /> All credentials saved
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <form onSubmit={saveCredentials} className="space-y-4">
                    {providerDetails.credentials.map((c, i) => (
                      <motion.div 
                        key={c.key} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.05 }}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-sm font-medium text-text-secondary">{c.label}</label>
                        <input 
                          type={c.type} 
                          value={credentialsForm[c.key] !== undefined ? credentialsForm[c.key] : ''}
                          onChange={e => handleCredentialChange(c.key, e.target.value)}
                          placeholder={c.is_saved ? "••••••••••••••••" : c.placeholder}
                          className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-text-tertiary"
                        />
                        {c.is_saved && credentialsForm[c.key] === undefined && (
                          <p className="text-xs text-text-tertiary mt-0.5">Saved securely. Enter a new value to update.</p>
                        )}
                      </motion.div>
                    ))}
                    <div className="pt-2">
                      <motion.button 
                        type="submit"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="px-6 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-all"
                      >
                        Save Credentials
                      </motion.button>
                    </div>
                  </form>
                </motion.div>

                {/* Models Section */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.25 }}
                  className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
                >
                  <div className="px-6 py-5 border-b border-border bg-surface">
                    <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                      <CpuChipIcon className="w-5 h-5 text-text-secondary" />
                      Available Models
                    </h3>
                  </div>
                  
                  <AnimatePresence>
                    {!providerDetails.all_credentials_saved && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-amber-50 p-4 border-b border-warning/20 flex items-start gap-3"
                      >
                        <ExclamationTriangleIcon className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                        <p className="text-sm text-warning font-medium">You must save all required credentials before you can activate models.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="divide-y divide-border">
                    {providerDetails.models.map((m, i) => (
                      <motion.div 
                        key={m.model_string}
                        custom={i}
                        variants={modelRowVariants}
                        initial="hidden"
                        animate="visible"
                        className="p-5 flex items-center justify-between hover:bg-surface transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-sm font-bold text-text-primary">{m.name}</span>
                            <AnimatePresence>
                              {m.is_active && (
                                <motion.span 
                                  initial={{ opacity: 0, scale: 0.5 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.5 }}
                                  className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success bg-green-50 border border-green-200 rounded-full"
                                >
                                  Active
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                          <p className="text-xs text-text-secondary">{m.description}</p>
                          <p className="text-[11px] text-text-tertiary font-mono mt-1">{m.model_string}</p>
                        </div>
                        
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => toggleModel(m)}
                          disabled={!providerDetails.all_credentials_saved}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                            m.is_active ? 'bg-primary' : 'bg-gray-200'
                          } ${!providerDetails.all_credentials_saved ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          title={!providerDetails.all_credentials_saved ? "Save credentials first" : m.is_active ? "Deactivate" : "Activate"}
                        >
                          <motion.span 
                            layout
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className={`inline-block h-4 w-4 transform rounded-full bg-white ${
                              m.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`} 
                          />
                        </motion.button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
