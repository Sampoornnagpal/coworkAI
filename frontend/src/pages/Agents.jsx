import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { UserGroupIcon, TrashIcon, PlayIcon, PlusIcon, XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon, SignalIcon, KeyIcon, ServerStackIcon, CodeBracketIcon } from '@heroicons/react/24/outline';
import { Navigate } from 'react-router-dom';

const PROVIDERS = [
  { id: 'custom', name: 'Custom A2A Agent', color: 'slate' },
  { id: 'langgraph', name: 'LangGraph', color: 'blue' },
  { id: 'pydantic_ai', name: 'Pydantic AI', color: 'emerald' },
  { id: 'bedrock_agent', name: 'Bedrock Agent', color: 'orange' },
  { id: 'vertex_ai_agent', name: 'Vertex AI Agent', color: 'purple' },
  { id: 'azure_ai_agent', name: 'Azure AI Agent', color: 'cyan' },
];

const LITELLM_PROVIDERS = new Set(['langgraph', 'pydantic_ai', 'bedrock_agent', 'vertex_ai_agent', 'azure_ai_agent']);

const PROVIDER_COLORS = {
  custom: 'bg-slate-50 text-slate-700 border-slate-200',
  langgraph: 'bg-blue-50 text-blue-700 border-blue-200',
  pydantic_ai: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  bedrock_agent: 'bg-orange-50 text-orange-700 border-orange-200',
  vertex_ai_agent: 'bg-purple-50 text-purple-700 border-purple-200',
  azure_ai_agent: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const agentCardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: (i) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 30, delay: i * 0.06 }
  }),
  exit: { opacity: 0, x: -30, transition: { duration: 0.2 } }
};

const providerCardVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i) => ({
    opacity: 1, scale: 1,
    transition: { type: 'spring', stiffness: 500, damping: 30, delay: i * 0.04 }
  }),
};

export default function Agents() {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [proxyHealth, setProxyHealth] = useState(null);
  const [providerSpecs, setProviderSpecs] = useState({});

  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formData, setFormData] = useState({
    agent_name: '',
    agent_url: '',
    agent_description: '',
    agent_provider: 'custom',
  });
  const [credentialValues, setCredentialValues] = useState({});
  const [testState, setTestState] = useState({});

  const loadAgents = () => {
    setLoading(true);
    api.get('/a2a/agents')
      .then(r => setAgents(r.data.agents))
      .catch(() => setMsg({ ok: false, text: 'Failed to load agents' }))
      .finally(() => setLoading(false));
  };

  const loadProviderSpecs = () => {
    api.get('/a2a/provider-specs')
      .then(r => setProviderSpecs(r.data.specs))
      .catch(() => {});
  };

  const checkProxyHealth = () => {
    fetch('http://localhost:4000/health/readiness')
      .then(r => r.ok ? setProxyHealth('ok') : setProxyHealth('error'))
      .catch(() => setProxyHealth('error'));
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAgents();
      loadProviderSpecs();
      checkProxyHealth();
    }
  }, [user]);

  useEffect(() => {
    setCredentialValues({});
  }, [formData.agent_provider]);

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const isLitellmProvider = LITELLM_PROVIDERS.has(formData.agent_provider);
  const currentSpec = providerSpecs[formData.agent_provider];

  const handleRegister = async (e) => {
    e.preventDefault();
    setAdding(true);
    setMsg(null);
    try {
      const payload = {
        agent_name: formData.agent_name,
        agent_description: formData.agent_description,
        agent_provider: formData.agent_provider,
        agent_url: isLitellmProvider ? '' : formData.agent_url,
        credentials: isLitellmProvider ? credentialValues : {},
      };
      await api.post('/a2a/agents', payload);
      setMsg({ ok: true, text: `Agent "${formData.agent_name}" registered successfully${isLitellmProvider ? ' — it will appear in Chat!' : ''}` });
      setShowForm(false);
      setFormData({ agent_name: '', agent_url: '', agent_description: '', agent_provider: 'custom' });
      setCredentialValues({});
      loadAgents();
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to register agent' });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete agent "${name}"?`)) return;
    try {
      await api.delete(`/a2a/agents/${id}`);
      setMsg({ ok: true, text: `Agent "${name}" deleted` });
      loadAgents();
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to delete agent' });
    }
  };

  const testAgent = async (id) => {
    setTestState(prev => ({ ...prev, [id]: { loading: true, error: null, response: null } }));
    try {
      const res = await api.post(`/a2a/agents/${id}/test`);
      setTestState(prev => ({ ...prev, [id]: { loading: false, error: null, response: res.data.response } }));
    } catch (err) {
      setTestState(prev => ({ ...prev, [id]: { loading: false, error: err.response?.data?.detail || 'Test failed', response: null } }));
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
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-text-primary">A2A Agents</h1>
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-1.5 px-3 py-1 bg-surface rounded-full border border-border text-xs font-medium"
          >
            <motion.div 
              className={`w-2 h-2 rounded-full ${proxyHealth === 'ok' ? 'bg-success' : proxyHealth === 'error' ? 'bg-danger' : 'bg-text-tertiary'}`}
              animate={proxyHealth === 'ok' ? { scale: [1, 1.4, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-text-secondary">
              LiteLLM Proxy {proxyHealth === 'ok' ? 'Online' : proxyHealth === 'error' ? 'Offline' : 'Checking...'}
            </span>
          </motion.div>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors shadow-sm"
        >
          <motion.div animate={showForm ? { rotate: 45 } : { rotate: 0 }} transition={{ type: 'spring', stiffness: 300 }}>
            <PlusIcon className="w-4 h-4" />
          </motion.div>
          Register Agent
        </motion.button>
      </motion.header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 lg:px-8 py-8 space-y-8">
        {/* Messages */}
        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -12, height: 0 }}
              className={`p-4 rounded-btn text-sm font-medium flex items-center justify-between shadow-sm ${msg.ok ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'}`}
            >
              <span>{msg.text}</span>
              <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Registration Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-xl border border-border shadow-sm p-6 overflow-hidden"
            >
              <h2 className="text-base font-semibold text-text-primary mb-2 flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-text-secondary" />
                Register New Agent
              </h2>
              
              {/* Provider Framework Selection */}
              <div className="mb-6">
                <p className="text-xs text-text-secondary mb-3 font-medium uppercase tracking-wider">Agent Framework</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {PROVIDERS.map((p, i) => {
                    const isSelected = formData.agent_provider === p.id;
                    const isLitellm = LITELLM_PROVIDERS.has(p.id);
                    return (
                      <motion.button
                        key={p.id}
                        custom={i}
                        variants={providerCardVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        onClick={() => setFormData({ ...formData, agent_provider: p.id })}
                        className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border-2 text-xs font-semibold transition-colors relative overflow-hidden ${
                          isSelected
                            ? 'border-primary bg-primary-light text-primary ring-2 ring-primary/20'
                            : 'border-border bg-white text-text-secondary hover:border-slate-300 hover:bg-surface'
                        }`}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="provider-highlight"
                            className="absolute inset-0 bg-primary/5 rounded-lg"
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">
                          {isLitellm ? (
                            <ServerStackIcon className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-text-tertiary'}`} />
                          ) : (
                            <UserGroupIcon className={`w-5 h-5 ${isSelected ? 'text-primary' : 'text-text-tertiary'}`} />
                          )}
                        </span>
                        <span className="text-center leading-tight relative z-10">{p.name}</span>
                        {isLitellm && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase tracking-wider relative z-10">LiteLLM</span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col gap-1.5"
                  >
                    <label className="text-sm font-medium text-text-secondary">Agent Name</label>
                    <input
                      type="text"
                      value={formData.agent_name}
                      onChange={e => setFormData({ ...formData, agent_name: e.target.value })}
                      required
                      placeholder="e.g. Currency Converter Agent"
                      className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 }}
                    className="flex flex-col gap-1.5"
                  >
                    <label className="text-sm font-medium text-text-secondary">Description</label>
                    <input
                      type="text"
                      value={formData.agent_description}
                      onChange={e => setFormData({ ...formData, agent_description: e.target.value })}
                      placeholder="What does this agent do?"
                      className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    />
                  </motion.div>
                </div>

                {/* Dynamic Section */}
                <AnimatePresence mode="wait">
                  {!isLitellmProvider ? (
                    <motion.div
                      key="custom"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="flex flex-col gap-4"
                    >
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-text-secondary">Agent URL (A2A Endpoint)</label>
                        <input
                          type="url"
                          value={formData.agent_url}
                          onChange={e => setFormData({ ...formData, agent_url: e.target.value })}
                          required
                          placeholder="http://localhost:5001/a2a"
                          className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                      </div>
                      
                      {/* JSON-RPC Schema Note */}
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CodeBracketIcon className="w-4 h-4 text-primary" />
                          <h4 className="text-sm font-semibold text-primary">Required JSON-RPC Schema</h4>
                        </div>
                        <p className="text-xs text-text-secondary mb-3">
                          Custom agents must strictly implement the standard A2A JSON-RPC schema on their endpoint to be compatible with LiteLLM routing.
                        </p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div className="bg-white border border-border rounded-md p-2 overflow-x-auto">
                            <span className="text-[10px] font-bold text-text-tertiary uppercase mb-1 block">Request Format</span>
                            <pre className="text-[10px] text-text-secondary">
{`{
  "jsonrpc": "2.0",
  "method": "tasks/send",
  "id": "req-123",
  "params": {
    "message": "user input"
  }
}`}
                            </pre>
                          </div>
                          <div className="bg-white border border-border rounded-md p-2 overflow-x-auto">
                            <span className="text-[10px] font-bold text-text-tertiary uppercase mb-1 block">Response Format</span>
                            <pre className="text-[10px] text-text-secondary">
{`{
  "jsonrpc": "2.0",
  "id": "req-123",
  "result": {
    "artifacts": [
      {
        "parts": [
          {"kind": "text", "text": "agent reply"}
        ]
      }
    ]
  }
}`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`litellm-${formData.agent_provider}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="bg-surface rounded-lg border border-border p-4 space-y-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 0.5 }}>
                          <KeyIcon className="w-4 h-4 text-primary" />
                        </motion.div>
                        <h3 className="text-sm font-semibold text-text-primary">
                          {PROVIDERS.find(p => p.id === formData.agent_provider)?.name} Credentials
                        </h3>
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase tracking-wider"
                        >
                          Routed via LiteLLM
                        </motion.span>
                      </div>
                      <p className="text-[11px] text-text-tertiary -mt-2">
                        These credentials are encrypted and stored securely. They enable LiteLLM to connect to your agent framework.
                      </p>

                      {currentSpec?.required_credentials?.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {currentSpec.required_credentials.map((cred, ci) => (
                            <motion.div
                              key={cred.key}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: ci * 0.06 }}
                              className="flex flex-col gap-1.5"
                            >
                              <label className="text-sm font-medium text-text-secondary">
                                {cred.label}
                              </label>
                              <input
                                type={cred.type === 'password' ? 'password' : 'text'}
                                value={credentialValues[cred.key] || ''}
                                onChange={e => setCredentialValues(prev => ({ ...prev, [cred.key]: e.target.value }))}
                                placeholder={cred.placeholder || ''}
                                className="w-full px-4 py-2 bg-white border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                              />
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-text-tertiary italic">Loading credential fields...</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="pt-2 flex gap-3">
                  <motion.button
                    type="submit"
                    disabled={adding}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-6 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-50"
                  >
                    {adding ? 'Registering...' : 'Register Agent'}
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowForm(false); setCredentialValues({}); }}
                    className="px-6 py-2 bg-surface text-text-secondary rounded-btn text-sm font-medium hover:bg-background border border-border transition-all"
                  >
                    Cancel
                  </motion.button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Agents List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.1 }}
          className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-border bg-surface flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Registered Agents</h2>
            <span className="text-xs text-text-tertiary">{agents.length} agent{agents.length !== 1 && 's'}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex gap-2">
                {[0, .2, .4].map(d => (
                  <motion.div
                    key={d}
                    className="w-3 h-3 rounded-full bg-primary"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: d }}
                  />
                ))}
              </div>
            </div>
          ) : agents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-12 text-center text-text-tertiary text-sm"
            >
              No agents registered yet. Click "Register Agent" to add one.
            </motion.div>
          ) : (
            <div className="divide-y divide-border">
              <AnimatePresence>
                {agents.map((a, i) => {
                  const state = testState[a.id] || {};
                  const providerLabel = PROVIDERS.find(p => p.id === a.agent_provider)?.name || a.agent_provider;
                  const isLitellm = a.is_litellm;
                  const badgeColor = PROVIDER_COLORS[a.agent_provider] || PROVIDER_COLORS.custom;

                  return (
                    <motion.div
                      key={a.id}
                      custom={i}
                      variants={agentCardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      className="p-6"
                    >
                      <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-sm font-bold text-text-primary">{a.agent_name}</h3>
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border rounded-full ${badgeColor}`}>
                              {providerLabel}
                            </span>
                            {isLitellm && (
                              <motion.span
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 rounded-full"
                              >
                                LiteLLM
                              </motion.span>
                            )}
                            {a.is_active ? (
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success bg-green-50 border border-green-200 rounded-full">Active</span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-tertiary bg-surface border border-border rounded-full">Inactive</span>
                            )}
                          </div>
                          {a.agent_description && (
                            <p className="text-xs text-text-secondary mb-1">{a.agent_description}</p>
                          )}

                          {isLitellm ? (
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <span className="text-xs text-text-tertiary font-mono bg-surface px-2 py-0.5 rounded border border-border">
                                {a.model_string}
                              </span>
                              {a.credentials_configured ? (
                                <motion.span
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="flex items-center gap-1 text-[11px] text-success font-medium"
                                >
                                  <CheckCircleIcon className="w-3.5 h-3.5" /> Credentials configured
                                </motion.span>
                              ) : (
                                <motion.span
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="flex items-center gap-1 text-[11px] text-warning font-medium"
                                >
                                  <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Missing credentials
                                </motion.span>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-text-tertiary font-mono">{a.agent_url}</p>
                          )}

                          <p className="text-[11px] text-text-tertiary mt-2">Registered {new Date(a.created_at).toLocaleDateString()}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => testAgent(a.id)}
                            disabled={state.loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-light text-primary border border-primary/20 rounded-btn text-xs font-semibold hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                          >
                            <PlayIcon className="w-4 h-4" />
                            {state.loading ? 'Testing...' : 'Test'}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1, backgroundColor: 'rgba(239,68,68,0.05)' }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(a.id, a.agent_name)}
                            className="p-1.5 text-text-tertiary hover:text-danger rounded-md transition-colors border border-transparent hover:border-red-100"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </motion.button>
                        </div>
                      </div>

                      {/* Test Results */}
                      <AnimatePresence>
                        {(state.response || state.error) && (
                          <motion.div
                            initial={{ opacity: 0, y: -8, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            className={`mt-4 p-4 rounded-lg border ${state.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}
                          >
                            {state.error ? (
                              <div className="flex items-center gap-2 text-danger text-sm font-medium">
                                <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                                {state.error}
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-bold text-success mb-2 flex items-center gap-2">
                                  <CheckCircleIcon className="w-5 h-5" />
                                  Agent Responded Successfully
                                </p>
                                <pre className="text-xs text-text-primary bg-white border border-green-100 p-3 rounded-md whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                                  {state.response}
                                </pre>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
