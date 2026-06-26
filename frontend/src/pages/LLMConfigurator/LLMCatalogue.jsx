import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cog8ToothIcon, CpuChipIcon } from '@heroicons/react/24/outline';

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

const CONFIG_API = 'http://localhost:8001';

export default function LLMCatalogue() {
  const [providers, setProviders] = useState({});
  const [globalModels, setGlobalModels] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [configModalModel, setConfigModalModel] = useState(null);
  const [formData, setFormData] = useState({ api_key: '', api_base: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [modelsRes, globalModelsRes] = await Promise.all([
        fetch(`${CONFIG_API}/catalog/models`).then(r => r.json()),
        fetch(`${CONFIG_API}/catalog/global_models`).then(r => r.json())
      ]);

      setGlobalModels(globalModelsRes);

      // Group models by provider
      const grouped = {};
      modelsRes.forEach(m => {
        if (!grouped[m.provider]) {
          grouped[m.provider] = {
            id: m.provider,
            name: m.provider,
            models: []
          };
        }
        grouped[m.provider].models.push(m);
      });
      setProviders(grouped);
    } catch (err) {
      setMsg({ ok: false, text: 'Failed to load catalogue data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectProvider = (providerId) => {
    setSelectedProvider(providerId);
    setMsg(null);
  };

  const handleConfigure = (model) => {
    const existing = globalModels.find(g => g.litellm_model === model.model_key);
    setFormData({
      api_key: existing?.api_key || '',
      api_base: existing?.api_base || ''
    });
    setConfigModalModel(model);
  };

  const saveConfiguration = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${CONFIG_API}/catalog/global_models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          litellm_model: configModalModel.model_key,
          provider: configModalModel.provider,
          api_key: formData.api_key || null,
          api_base: formData.api_base || null
        })
      });
      if (!res.ok) throw new Error('Failed to save');
      
      setMsg({ ok: true, text: 'Configuration saved successfully' });
      setConfigModalModel(null);
      loadData();
    } catch (err) {
      setMsg({ ok: false, text: 'Failed to save configuration' });
    }
  };

  const isModelConfigured = (modelKey) => {
    return globalModels.some(g => g.litellm_model === modelKey);
  };

  const getProviderConfiguredCount = (providerId) => {
    const pModels = providers[providerId]?.models || [];
    return pModels.filter(m => isModelConfigured(m.model_key)).length;
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
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
                onClick={() => { setSelectedProvider(null); setMsg(null); }}
                className="mr-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </motion.button>
            )}
          </AnimatePresence>
          <h1 className="text-lg font-semibold text-text-primary">Models Catalogue</h1>
        </div>
      </motion.header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 lg:px-8 py-8 space-y-8">
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
                  <h2 className="text-xl font-bold text-text-primary mb-1">LiteLLM Providers</h2>
                  <p className="text-sm text-text-secondary">Select a provider to configure models for use in LLM Configurations.</p>
                </motion.div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.values(providers).map((p, i) => {
                    const confCount = getProviderConfiguredCount(p.id);
                    return (
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
                              className={`w-2.5 h-2.5 rounded-full ${confCount > 0 ? 'bg-success' : 'bg-text-tertiary'}`}
                            />
                            {confCount > 0 ? `${confCount} Configured` : 'None configured'}
                          </div>
                        </div>
                        <p className="text-sm text-text-secondary flex items-center gap-1.5">
                          <CpuChipIcon className="w-4 h-4" />
                          {p.models.length} models available
                        </p>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
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
                  <h2 className="text-2xl font-bold text-text-primary mb-1">{selectedProvider}</h2>
                  <p className="text-sm text-text-secondary">Configure models from this provider to use them in your Fallback Chains.</p>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.25 }}
                  className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
                >
                  <div className="px-6 py-5 border-b border-border bg-surface">
                    <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                      <CpuChipIcon className="w-5 h-5 text-text-secondary" />
                      Models
                    </h3>
                  </div>

                  <div className="divide-y divide-border">
                    {providers[selectedProvider].models.map((m, i) => {
                      const isConf = isModelConfigured(m.model_key);
                      return (
                        <motion.div 
                          key={m.model_key}
                          custom={i}
                          variants={modelRowVariants}
                          initial="hidden"
                          animate="visible"
                          className="p-5 flex items-center justify-between hover:bg-surface transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-sm font-bold text-text-primary">{m.model_key}</span>
                              <AnimatePresence>
                                {isConf && (
                                  <motion.span 
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                    className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success bg-green-50 border border-green-200 rounded-full"
                                  >
                                    Configured
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </div>
                            <p className="text-xs text-text-secondary">Mode: {m.mode}</p>
                          </div>
                          
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleConfigure(m)}
                            className="px-4 py-1.5 text-sm font-medium bg-white border border-border rounded-btn hover:bg-surface hover:text-primary transition-colors"
                          >
                            <Cog8ToothIcon className="w-4 h-4 inline-block mr-1" />
                            {isConf ? 'Edit' : 'Configure'}
                          </motion.button>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {configModalModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-border bg-surface">
              <h3 className="text-lg font-bold text-text-primary">Configure {configModalModel.model_key}</h3>
            </div>
            <form onSubmit={saveConfiguration} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">API Key (Optional)</label>
                <input 
                  type="password" 
                  value={formData.api_key}
                  onChange={e => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="Enter API key"
                  className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-secondary">API Base (Optional)</label>
                <input 
                  type="text" 
                  value={formData.api_base}
                  onChange={e => setFormData({ ...formData, api_base: e.target.value })}
                  placeholder="Enter custom API base URL"
                  className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                />
              </div>
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button" 
                  onClick={() => setConfigModalModel(null)}
                  className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-all"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
