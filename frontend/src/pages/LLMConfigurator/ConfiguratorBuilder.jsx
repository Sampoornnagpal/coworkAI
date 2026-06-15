import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import configApi from './configApi';
import { 
  ArrowLeftIcon, 
  XMarkIcon,
  PlusIcon,
  CheckIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EyeIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

const RESERVED_SEGMENTS = ['chat', 'completion', 'embedding', 'image_generation', 'audio_transcription', 'audio_speech', 'vision', 'completions', 'embeddings', 'images', 'audio', 'usage', 'capabilities'];

export default function ConfiguratorBuilder() {
  const { fullName } = useParams();
  const isEdit = Boolean(fullName);
  const navigate = useNavigate();

  // Dynamic operations
  const [operationModes, setOperationModes] = useState([]);

  // Form state
  const [usecaseName, setUsecaseName] = useState('');
  const [configName, setConfigName] = useState('');
  const [restrictions, setRestrictions] = useState({ tpm: 10000, rpm: 10, tpr: 1000 });
  const [guardrails, setGuardrails] = useState({ pii_masking: false, profanity_filter: false });
  
  // Operations mapping: mode -> array of { litellm_model, api_key_env, api_base }
  const [operations, setOperations] = useState({});
  const [customOperations, setCustomOperations] = useState({});

  // UI state
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Catalog models
  const [catalog, setCatalog] = useState({}); // { mode: [models] }
  const [searchTerms, setSearchTerms] = useState({}); // { mode: term }

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        // Fetch operations spec to dynamically build sections
        const { data: opData } = await configApi.get('/catalog/operations');
        const activeModes = opData.filter(op => !op.derived).map(op => op.operation);
        setOperationModes(activeModes);
        const newCatalog = {};
        await Promise.all(activeModes.map(async (mode) => {
          try {
            const { data } = await configApi.get(`/catalog/models?mode=${mode}`);
            newCatalog[mode] = data;
          } catch (err) {
            newCatalog[mode] = [];
            setMsg(prev => prev || { ok: false, text: `Failed to load models for ${mode}` });
          }
        }));
        setCatalog(newCatalog);
      } catch (err) {
        setMsg({ ok: false, text: 'Failed to load catalog operations.' });
      }
    };

    const loadExisting = async () => {
      try {
        const { data } = await configApi.get(`/configs/${fullName}`);
        setUsecaseName(data.usecase_name);
        setConfigName(data.config_name);
        setRestrictions(data.restrictions);
        setGuardrails(data.guardrails);
        
        // Strip out priority and just keep array ordered
        const newOps = {};
        Object.entries(data.operations || {}).forEach(([mode, opArray]) => {
          newOps[mode] = [...opArray].sort((a, b) => a.priority - b.priority).map(item => ({
            litellm_model: item.litellm_model,
            api_key_env: item.api_key_env || '',
            api_base: item.api_base || '',
            rpm: item.rpm != null ? String(item.rpm) : '',
            tpm: item.tpm != null ? String(item.tpm) : ''
          }));
        });
        setOperations(newOps);

        const newCustomOps = {};
        Object.entries(data.custom_operations || {}).forEach(([name, opData]) => {
          newCustomOps[name] = {
            description: opData.description || '',
            models: [...(opData.models || [])].sort((a, b) => a.priority - b.priority).map(item => ({
              litellm_model: item.litellm_model,
              api_key_env: item.api_key_env || '',
              api_base: item.api_base || '',
              rpm: item.rpm != null ? String(item.rpm) : '',
              tpm: item.tpm != null ? String(item.tpm) : ''
            }))
          };
        });
        setCustomOperations(newCustomOps);
      } catch (err) {
        setMsg({ ok: false, text: 'Failed to load configuration.' });
      }
    };

    loadCatalog().then(() => {
      if (isEdit) {
        loadExisting().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, [isEdit, fullName]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    // Reconstruct operations with priority (implicitly rendering them contiguous from 1)
    const finalOps = {};
    Object.entries(operations).forEach(([mode, opArray]) => {
      if (opArray.length > 0) {
        finalOps[mode] = opArray.map((item, idx) => ({
          ...item,
          priority: idx + 1,
          api_key_env: item.api_key_env || null,
          api_base: item.api_base || null,
          rpm: item.rpm ? parseInt(item.rpm) : null,
          tpm: item.tpm ? parseInt(item.tpm) : null
        }));
      }
    });

    const finalCustomOps = {};
    Object.entries(customOperations).forEach(([name, opData]) => {
      if (opData.models.length > 0) {
        finalCustomOps[name] = {
          description: opData.description,
          models: opData.models.map((item, idx) => ({
            ...item,
            priority: idx + 1,
            api_key_env: item.api_key_env || null,
            api_base: item.api_base || null,
            rpm: item.rpm ? parseInt(item.rpm) : null,
            tpm: item.tpm ? parseInt(item.tpm) : null
          }))
        };
      }
    });

    const payload = {
      usecase_name: usecaseName,
      config_name: configName,
      operations: finalOps,
      custom_operations: Object.keys(finalCustomOps).length > 0 ? finalCustomOps : null,
      restrictions,
      guardrails
    };

    try {
      if (isEdit) {
        await configApi.put(`/configs/${fullName}`, payload);
        setMsg({ ok: true, text: 'Configuration updated successfully.' });
        setTimeout(() => navigate('/llm-configurator'), 1000);
      } else {
        await configApi.post('/configs', payload);
        setMsg({ ok: true, text: 'Configuration created successfully.' });
        setTimeout(() => navigate('/llm-configurator'), 1000);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setMsg({ ok: false, text: 'config name already taken' });
      } else if (err.response?.status === 400 || err.response?.status === 422) {
        const detail = err.response?.data?.detail;
        if (Array.isArray(detail)) {
          setMsg({ ok: false, text: detail.map(d => d.msg).join('; ') });
        } else {
          setMsg({ ok: false, text: typeof detail === 'string' ? detail : 'Bad request' });
        }
      } else {
        setMsg({ ok: false, text: 'Failed to save configuration.' });
      }
      setSaving(false);
    }
  };

  const addModelToOperation = (mode, modelObj) => {
    setOperations(prev => {
      const current = prev[mode] || [];
      if (current.some(op => op.litellm_model === modelObj.model_key)) {
        return prev;
      }
      return {
        ...prev,
        [mode]: [...current, { litellm_model: modelObj.model_key, api_key_env: '', api_base: '', rpm: '', tpm: '' }]
      };
    });
  };

  const removeModelFromOperation = (mode, idx) => {
    setOperations(prev => {
      const current = [...(prev[mode] || [])];
      current.splice(idx, 1);
      return { ...prev, [mode]: current };
    });
  };

  const moveModel = (mode, idx, direction) => {
    setOperations(prev => {
      const current = [...(prev[mode] || [])];
      if (direction === 'up' && idx > 0) {
        const temp = current[idx];
        current[idx] = current[idx - 1];
        current[idx - 1] = temp;
      } else if (direction === 'down' && idx < current.length - 1) {
        const temp = current[idx];
        current[idx] = current[idx + 1];
        current[idx + 1] = temp;
      }
      return { ...prev, [mode]: current };
    });
  };

  const updateModelField = (mode, idx, field, val) => {
    setOperations(prev => {
      const current = [...(prev[mode] || [])];
      current[idx] = { ...current[idx], [field]: val };
      return { ...prev, [mode]: current };
    });
  };

  const addCustomOp = () => {
    const name = prompt("Enter custom operation name (letters, numbers, hyphens, underscores only):");
    if (!name) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return setMsg({ ok: false, text: "Invalid name format." });
    if (RESERVED_SEGMENTS.includes(name)) return setMsg({ ok: false, text: "This name is reserved." });
    if (customOperations[name]) return setMsg({ ok: false, text: "Custom operation already exists." });
    if (Object.keys(customOperations).length >= 10) return setMsg({ ok: false, text: "Maximum 10 custom operations allowed." });
    setCustomOperations(prev => ({ ...prev, [name]: { description: '', models: [] } }));
  };

  const updateCustomOpDesc = (name, val) => {
    setCustomOperations(prev => ({ ...prev, [name]: { ...prev[name], description: val } }));
  };

  const updateCustomOpModelField = (name, idx, field, val) => {
    setCustomOperations(prev => {
      const current = [...prev[name].models];
      current[idx] = { ...current[idx], [field]: val };
      return { ...prev, [name]: { ...prev[name], models: current } };
    });
  };

  const moveCustomModel = (name, idx, direction) => {
    setCustomOperations(prev => {
      const current = [...prev[name].models];
      if (direction === 'up' && idx > 0) {
        const temp = current[idx]; current[idx] = current[idx - 1]; current[idx - 1] = temp;
      } else if (direction === 'down' && idx < current.length - 1) {
        const temp = current[idx]; current[idx] = current[idx + 1]; current[idx + 1] = temp;
      }
      return { ...prev, [name]: { ...prev[name], models: current } };
    });
  };

  const removeCustomModel = (name, idx) => {
    setCustomOperations(prev => {
      const current = [...prev[name].models];
      current.splice(idx, 1);
      return { ...prev, [name]: { ...prev[name], models: current } };
    });
  };

  const addModelToCustomOp = (name, modelObj) => {
    setCustomOperations(prev => {
      const current = prev[name].models;
      if (current.some(op => op.litellm_model === modelObj.model_key)) return prev;
      return { ...prev, [name]: { ...prev[name], models: [...current, { litellm_model: modelObj.model_key, api_key_env: '', api_base: '', rpm: '', tpm: '' }] } };
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] bg-background">
        <div className="flex gap-2">
          {[0,.2,.4].map(d => <motion.div key={d} animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity, delay: d }} className="w-3 h-3 rounded-full bg-primary" />)}
        </div>
      </div>
    );
  }

  const generatedFullName = usecaseName && configName ? `${usecaseName}_${configName}` : '';
  const generatedEndpoint = generatedFullName ? `http://localhost:8001/llm/${generatedFullName}` : '';

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto pb-20">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-[64px] shrink-0 px-6 lg:px-8 flex items-center gap-4 border-b border-border bg-white z-10 sticky top-0"
      >
        <button onClick={() => navigate('/llm-configurator')} className="p-2 -ml-2 text-text-secondary hover:bg-surface rounded-full transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">
          {isEdit ? 'Edit Configuration' : 'Create Configuration'}
        </h1>
      </motion.header>

      <div className="flex-1 max-w-4xl w-full mx-auto px-6 lg:px-8 py-8">
        
        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -16, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, y: -16, height: 0, marginBottom: 0 }}
              className={`p-4 rounded-btn text-sm font-medium flex items-center justify-between shadow-sm overflow-hidden ${msg.ok ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'}`}
            >
              <span>{msg.text}</span>
              <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSave} className="space-y-8">
          
          {/* Identity Section */}
          <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
            <h2 className="text-base font-semibold text-text-primary mb-4">Identity</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Usecase Name</label>
                <input
                  type="text"
                  required
                  pattern="^[a-zA-Z0-9_-]+$"
                  title="Only letters, numbers, hyphens, and underscores are allowed."
                  value={usecaseName}
                  onChange={e => setUsecaseName(e.target.value)}
                  disabled={isEdit}
                  className="w-full px-4 py-2 border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background disabled:opacity-60"
                />
                <p className="text-[10px] text-text-tertiary mt-1">Letters, numbers, hyphens, underscores only.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Config Name</label>
                <input
                  type="text"
                  required
                  pattern="^[a-zA-Z0-9_-]+$"
                  title="Only letters, numbers, hyphens, and underscores are allowed."
                  value={configName}
                  onChange={e => setConfigName(e.target.value)}
                  disabled={isEdit}
                  className="w-full px-4 py-2 border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background disabled:opacity-60"
                />
                <p className="text-[10px] text-text-tertiary mt-1">Letters, numbers, hyphens, underscores only.</p>
              </div>
            </div>
            {isEdit && <p className="text-xs text-text-tertiary mt-2">Renaming requires deleting and creating a new config.</p>}
            
            {/* Live Preview */}
            <AnimatePresence>
              {generatedFullName && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                  className="p-4 bg-surface border border-border rounded-lg overflow-hidden"
                >
                  <p className="text-xs text-text-tertiary uppercase font-bold tracking-wider mb-1">Live Preview</p>
                  <p className="text-sm font-medium text-text-primary mb-1">Full Name: <span className="font-mono text-primary">{generatedFullName}</span></p>
                  <p className="text-sm text-text-secondary">Endpoint URL: <span className="font-mono">{generatedEndpoint}</span></p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Restrictions Section */}
          <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
            <h2 className="text-base font-semibold text-text-primary mb-4">Restrictions</h2>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Tokens Per Minute (TPM)</label>
                <input type="number" required min="1" value={restrictions.tpm} onChange={e => setRestrictions({...restrictions, tpm: parseInt(e.target.value) || 1})} className="w-full px-4 py-2 border border-border rounded-btn text-sm bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Requests Per Minute (RPM)</label>
                <input type="number" required min="1" value={restrictions.rpm} onChange={e => setRestrictions({...restrictions, rpm: parseInt(e.target.value) || 1})} className="w-full px-4 py-2 border border-border rounded-btn text-sm bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Tokens Per Request (TPR)</label>
                <input type="number" required min="1" value={restrictions.tpr} onChange={e => setRestrictions({...restrictions, tpr: parseInt(e.target.value) || 1})} className="w-full px-4 py-2 border border-border rounded-btn text-sm bg-background" />
              </div>
            </div>
          </div>

          {/* Guardrails Section */}
          <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
            <h2 className="text-base font-semibold text-text-primary mb-4">Guardrails</h2>
            <div className="flex gap-8">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={guardrails.pii_masking} onChange={e => setGuardrails({...guardrails, pii_masking: e.target.checked})} className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary" />
                <span className="text-sm font-medium text-text-secondary">PII Masking</span>
              </label>
              <label className="flex items-center gap-2 opacity-60 cursor-not-allowed">
                <input type="checkbox" disabled checked={guardrails.profanity_filter} className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary" />
                <span className="text-sm font-medium text-text-secondary">Profanity Filter <span className="text-[10px] bg-surface px-1.5 py-0.5 rounded text-text-tertiary uppercase ml-1">Coming Soon</span></span>
              </label>
            </div>
          </div>

          {/* Operations Section */}
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-text-primary">Operations Fallback Chains</h2>
            
            {operationModes.map(mode => {
              const currentOps = operations[mode] || [];
              const availableModels = catalog[mode] || [];
              
              // Group available models by provider
              const searchTerm = (searchTerms[mode] || '').toLowerCase();
              const filteredModels = availableModels.filter(m => m.model_key && m.model_key.toLowerCase().includes(searchTerm));
              const providerGroups = {};
              filteredModels.forEach(m => {
                const prov = m.provider || 'Other';
                if (!providerGroups[prov]) providerGroups[prov] = [];
                providerGroups[prov].push(m);
              });

              return (
                <div key={mode} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-text-primary capitalize">{mode}</h3>
                      {mode === 'chat' && <span className="text-[10px] uppercase font-bold text-danger bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">Required</span>}
                    </div>
                  </div>
                  
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Active Chain */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-text-secondary">Routing Chain</h4>
                      {currentOps.length === 0 ? (
                        <div className="p-4 border border-dashed border-border rounded-lg text-sm text-text-tertiary text-center bg-background">
                          No models selected for {mode}.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentOps.map((op, idx) => (
                            <div key={idx} className="p-3 border border-border rounded-lg bg-background flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full">{idx + 1}</span>
                                  <span className="font-semibold text-sm text-text-primary">{op.litellm_model}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => moveModel(mode, idx, 'up')} disabled={idx === 0} className="p-1 text-text-tertiary hover:text-primary disabled:opacity-30">
                                    <ChevronUpIcon className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => moveModel(mode, idx, 'down')} disabled={idx === currentOps.length - 1} className="p-1 text-text-tertiary hover:text-primary disabled:opacity-30">
                                    <ChevronDownIcon className="w-4 h-4" />
                                  </button>
                                  <button type="button" onClick={() => removeModelFromOperation(mode, idx)} className="p-1 text-text-tertiary hover:text-danger">
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                <input type="text" placeholder="api_key_env (optional)" value={op.api_key_env} onChange={e => updateModelField(mode, idx, 'api_key_env', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                                <input type="text" placeholder="api_base (optional)" value={op.api_base} onChange={e => updateModelField(mode, idx, 'api_base', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                              </div>
                              <div className="grid grid-cols-2 gap-2 mt-1 relative group/hint">
                                <input type="number" min="1" placeholder="RPM limit (optional)" value={op.rpm} onChange={e => updateModelField(mode, idx, 'rpm', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                                <input type="number" min="1" placeholder="TPM limit (optional)" value={op.tpm} onChange={e => updateModelField(mode, idx, 'tpm', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                                <div className="absolute top-full left-0 hidden group-hover/hint:block mt-1 p-1 bg-gray-800 text-white text-[10px] rounded shadow-lg z-10 w-full whitespace-normal">soft limit — affects fallback routing; config RPM is the hard cap</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Catalog Picker */}
                    <div className="space-y-3 border-l border-border pl-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-text-secondary">Model Catalog</h4>
                      </div>
                      <input 
                        type="text" 
                        placeholder="Search models..." 
                        value={searchTerms[mode] || ''}
                        onChange={e => setSearchTerms({...searchTerms, [mode]: e.target.value})}
                        className="w-full px-3 py-1.5 border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 bg-background"
                      />
                      
                      <div className="max-h-64 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {Object.entries(providerGroups).map(([provider, models]) => (
                          <div key={provider} className="space-y-1">
                            <h5 className="text-xs font-bold text-text-tertiary uppercase tracking-wider sticky top-0 bg-white py-1">{provider}</h5>
                            {models.map(m => {
                              const isAdded = currentOps.some(op => op.litellm_model === m.model_key);
                              return (
                                <div key={m.model_key} className={`flex items-center justify-between p-2 rounded-lg group ${isAdded ? 'bg-surface/60' : 'hover:bg-surface'}`}>
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-sm font-medium truncate ${isAdded ? 'text-text-tertiary' : 'text-text-primary'}`}>{m.model_key}</span>
                                      {m.supports_vision && <span title="Supports Vision" className="text-primary"><EyeIcon className="w-3.5 h-3.5" /></span>}
                                    </div>
                                  </div>
                                  {isAdded ? (
                                    <span className="p-1 text-success bg-green-50 rounded-md" title="Already added">
                                      <CheckIcon className="w-4 h-4" />
                                    </span>
                                  ) : (
                                    <button type="button" onClick={() => addModelToOperation(mode, m)} className="p-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity bg-primary-light rounded-md">
                                      <PlusIcon className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {Object.keys(providerGroups).length === 0 && (
                          <div className="text-center pt-4">
                            <div className="text-xs text-text-tertiary mb-3">No models match your search.</div>
                            {searchTerm && (
                              currentOps.some(op => op.litellm_model === searchTerms[mode])
                                ? <p className="text-xs text-success font-medium">✓ This model is already in your chain.</p>
                                : <button 
                                    type="button" 
                                    onClick={() => {
                                      addModelToOperation(mode, { model_key: searchTerms[mode], provider: 'custom', supports_vision: false });
                                      setSearchTerms({...searchTerms, [mode]: ''});
                                    }}
                                    className="px-3 py-1.5 bg-primary/10 text-primary rounded-md text-xs font-medium hover:bg-primary/20 transition-colors border border-primary/20"
                                  >
                                    Add "{searchTerms[mode]}" as custom model
                                  </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Custom Operations Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text-primary">Custom Operations</h2>
              <button type="button" onClick={addCustomOp} disabled={Object.keys(customOperations).length >= 10} className="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                <PlusIcon className="w-4 h-4" /> Add Custom Op
              </button>
            </div>

            {Object.keys(customOperations).length === 0 ? (
              <div className="bg-white p-6 rounded-xl border border-dashed border-border shadow-sm text-center">
                <p className="text-sm text-text-secondary">No custom operations configured.</p>
              </div>
            ) : (
              Object.entries(customOperations).map(([opName, opData]) => {
                const availableModels = catalog['chat'] || [];
                const searchTerm = (searchTerms[opName] || '').toLowerCase();
                const filteredModels = availableModels.filter(m => m.model_key && m.model_key.toLowerCase().includes(searchTerm));
                const providerGroups = {};
                filteredModels.forEach(m => {
                  const prov = m.provider || 'Other';
                  if (!providerGroups[prov]) providerGroups[prov] = [];
                  providerGroups[prov].push(m);
                });

                return (
                  <div key={opName} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold rounded uppercase">Custom</span>
                        <h3 className="text-base font-semibold text-text-primary">{opName}</h3>
                      </div>
                      <button type="button" onClick={() => {
                        const newOps = {...customOperations};
                        delete newOps[opName];
                        setCustomOperations(newOps);
                      }} className="p-1.5 text-text-tertiary hover:bg-red-50 hover:text-danger rounded transition-colors">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-6 border-b border-border">
                      <label className="block text-sm font-medium text-text-secondary mb-1">System Prompt / Description</label>
                      <textarea 
                        rows="2" 
                        required 
                        maxLength={2000}
                        value={opData.description} 
                        onChange={e => updateCustomOpDesc(opName, e.target.value)} 
                        className="w-full px-4 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background resize-y"
                        placeholder="This text is sent to the LLM as a system message before every request..."
                      />
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-text-secondary">Routing Chain</h4>
                        {opData.models.length === 0 ? (
                          <div className="p-4 border border-dashed border-border rounded-lg text-sm text-text-tertiary text-center bg-background">No models selected.</div>
                        ) : (
                          <div className="space-y-2">
                            {opData.models.map((op, idx) => (
                              <div key={idx} className="p-3 border border-border rounded-lg bg-background flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full">{idx + 1}</span>
                                    <span className="font-semibold text-sm text-text-primary">{op.litellm_model}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => moveCustomModel(opName, idx, 'up')} disabled={idx === 0} className="p-1 text-text-tertiary hover:text-primary disabled:opacity-30"><ChevronUpIcon className="w-4 h-4" /></button>
                                    <button type="button" onClick={() => moveCustomModel(opName, idx, 'down')} disabled={idx === opData.models.length - 1} className="p-1 text-text-tertiary hover:text-primary disabled:opacity-30"><ChevronDownIcon className="w-4 h-4" /></button>
                                    <button type="button" onClick={() => removeCustomModel(opName, idx)} className="p-1 text-text-tertiary hover:text-danger"><TrashIcon className="w-4 h-4" /></button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                  <input type="text" placeholder="api_key_env" value={op.api_key_env} onChange={e => updateCustomOpModelField(opName, idx, 'api_key_env', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                                  <input type="text" placeholder="api_base" value={op.api_base} onChange={e => updateCustomOpModelField(opName, idx, 'api_base', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1 relative group/hint">
                                  <input type="number" min="1" placeholder="RPM limit" value={op.rpm} onChange={e => updateCustomOpModelField(opName, idx, 'rpm', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                                  <input type="number" min="1" placeholder="TPM limit" value={op.tpm} onChange={e => updateCustomOpModelField(opName, idx, 'tpm', e.target.value)} className="w-full px-2 py-1 border border-border rounded text-xs bg-white focus:border-primary" />
                                  <div className="absolute top-full left-0 hidden group-hover/hint:block mt-1 p-1 bg-gray-800 text-white text-[10px] rounded shadow-lg z-10 w-full whitespace-normal">soft limit — affects fallback routing; config RPM is the hard cap</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 border-l border-border pl-6">
                        <h4 className="text-sm font-medium text-text-secondary">Model Catalog (chat)</h4>
                        <input type="text" placeholder="Search models..." value={searchTerms[opName] || ''} onChange={e => setSearchTerms({...searchTerms, [opName]: e.target.value})} className="w-full px-3 py-1.5 border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 bg-background" />
                        <div className="max-h-64 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                          {Object.entries(providerGroups).map(([provider, models]) => (
                            <div key={provider} className="space-y-1">
                              <h5 className="text-xs font-bold text-text-tertiary uppercase sticky top-0 bg-white py-1">{provider}</h5>
                              {models.map(m => {
                                const isAdded = opData.models.some(op => op.litellm_model === m.model_key);
                                return (
                                  <div key={m.model_key} className={`flex items-center justify-between p-2 rounded-lg group ${isAdded ? 'bg-surface/60' : 'hover:bg-surface'}`}>
                                    <span className={`text-sm font-medium truncate ${isAdded ? 'text-text-tertiary' : 'text-text-primary'}`}>{m.model_key}</span>
                                    {isAdded ? <span className="p-1 text-success bg-green-50 rounded-md"><CheckIcon className="w-4 h-4" /></span> : <button type="button" onClick={() => addModelToCustomOp(opName, m)} className="p-1 text-primary opacity-0 group-hover:opacity-100 bg-primary-light rounded-md"><PlusIcon className="w-4 h-4" /></button>}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
            <button type="button" onClick={() => navigate('/llm-configurator')} className="px-6 py-2 bg-surface text-text-secondary rounded-btn text-sm font-medium hover:bg-background border border-border transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving || !usecaseName || !configName || !operations.chat?.length} className="px-8 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
