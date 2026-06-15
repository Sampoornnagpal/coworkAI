import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import configApi from './configApi';
import { 
  ArrowLeftIcon, 
  XMarkIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

// Maps operation/endpoint key -> URL path segment and payload builder
const ENDPOINT_MAP = {
  chat:                 { path: 'chat',                buildBody: (input) => ({ messages: [{ role: 'user', content: input }] }) },
  vision:               { path: 'vision',              buildBody: (input) => ({ messages: [{ role: 'user', content: input }] }) },
  completion:           { path: 'completions',         buildBody: (input) => ({ prompt: input }) },
  embedding:            { path: 'embeddings',          buildBody: (input) => ({ input }) },
  image_generation:     { path: 'images/generations',  buildBody: (input) => ({ prompt: input }) },
  audio_speech:         { path: 'audio/speech',         buildBody: (input) => ({ input, voice: 'alloy' }) },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 }
  }
};

export default function ConfiguratorDetail() {
  const { fullName } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [usage, setUsage] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);

  // Test Panel state
  const [testEndpoint, setTestEndpoint] = useState('chat');
  const [testInput, setTestInput] = useState('Hello! How can I help you today?');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const loadData = async () => {
    try {
      const [confRes, capRes, usageRes] = await Promise.all([
        configApi.get(`/configs/${fullName}`),
        configApi.get(`/llm/${fullName}/capabilities`).catch(() => ({ data: {} })),
        configApi.get(`/llm/${fullName}/usage`).catch(() => ({ data: {} }))
      ]);
      setConfig(confRes.data);
      setCapabilities(capRes.data);
      setUsage(usageRes.data);
    } catch (err) {
      setErrorMsg('Failed to load configuration details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [fullName]);

  const copyToClipboard = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      // ignore
    }
  };

  const handleDelete = async () => {
    try {
      await configApi.delete(`/configs/${fullName}`);
      navigate('/llm-configurator');
    } catch (err) {
      const detail = err.response?.data?.detail;
      const text = typeof detail === 'string' ? detail : 'Failed to delete config';
      setErrorMsg(text);
      setShowDeleteModal(false);
    }
  };

  const handleTestSubmit = async (e) => {
    e.preventDefault();
    if (!testInput.trim()) return;
    
    setTestLoading(true);
    setTestResult(null);

    try {
      // Determine URL path and body based on selected endpoint
      const builtIn = ENDPOINT_MAP[testEndpoint];
      let urlPath, body;
      if (builtIn) {
        urlPath = builtIn.path;
        body = builtIn.buildBody(testInput);
      } else {
        // Custom operation — chat-style payload
        urlPath = testEndpoint;
        body = { messages: [{ role: 'user', content: testInput }] };
      }

      const { data } = await configApi.post(`/llm/${fullName}/${urlPath}`, body);
      
      // Extract display text based on response shape
      const replyText = data.choices?.[0]?.message?.content
        || data.choices?.[0]?.text
        || (data.data ? JSON.stringify(data.data, null, 2) : JSON.stringify(data, null, 2));
      setTestResult({
        ok: true,
        text: replyText,
        model_used: data.model_used
      });
      // reload usage to reflect the new test call
      loadData();
    } catch (err) {
      let errText = 'An error occurred';

      if (err.response?.status === 502) {
        errText = 'Provider failure: ' + (typeof err.response?.data?.detail === 'string' ? err.response.data.detail : '502 Bad Gateway');
      } else if (err.response?.status === 429) {
        const errorMsgStr = err.response?.data?.detail?.message || 'Rate limit exceeded';
        errText = `Rate Limit: ${errorMsgStr}`;
      } else if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        errText = typeof detail === 'string' ? detail : JSON.stringify(detail);
      }
      setTestResult({ ok: false, text: errText });
    } finally {
      setTestLoading(false);
    }
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

  if (!config) {
    return (
      <div className="flex flex-col h-full bg-background p-8">
        <div className="max-w-xl mx-auto text-center space-y-4">
          <ExclamationTriangleIcon className="w-12 h-12 text-danger mx-auto" />
          <h2 className="text-lg font-bold text-text-primary">Configuration Not Found</h2>
          <p className="text-text-secondary">{errorMsg}</p>
          <button onClick={() => navigate('/llm-configurator')} className="px-4 py-2 bg-primary text-white rounded-btn text-sm font-medium">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto pb-20">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-[64px] shrink-0 px-6 lg:px-8 flex items-center justify-between border-b border-border bg-white z-10 sticky top-0"
      >
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/llm-configurator')} className="p-2 -ml-2 text-text-secondary hover:bg-surface rounded-full transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            {config.full_name}
            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-badge ${
              config.status === 'active' ? 'bg-green-50 text-success border border-green-200' : 'bg-surface text-text-tertiary border border-border'
            }`}>
              {config.status}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            to={`/llm-configurator/${config.full_name}/edit`}
            className="px-4 py-2 bg-surface border border-border text-text-primary rounded-btn text-sm font-medium hover:bg-background transition-colors shadow-sm"
          >
            Edit Config
          </Link>
          <button 
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 bg-red-50 text-danger border border-red-200 rounded-btn text-sm font-medium hover:bg-red-100 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        </div>
      </motion.header>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full border border-border"
            >
              <div className="flex items-center gap-3 mb-4 text-danger">
                <ExclamationTriangleIcon className="w-6 h-6" />
                <h3 className="text-lg font-bold">Delete Configuration?</h3>
              </div>
              <p className="text-text-secondary text-sm mb-6">
                Are you sure you want to delete <span className="font-semibold">{config.full_name}</span>? 
                <br /><br />
                <span className="font-bold">WARNING:</span> The endpoint will die immediately.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 bg-surface text-text-secondary rounded-btn text-sm font-medium hover:bg-background border border-border transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-danger text-white rounded-btn text-sm font-medium hover:bg-red-700 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <motion.div 
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex-1 max-w-6xl w-full mx-auto px-6 lg:px-8 py-8 space-y-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Info Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Endpoints & Capabilities */}
            <motion.div variants={cardVariants} className="bg-white p-6 rounded-xl border border-border shadow-sm">
              <h2 className="text-base font-semibold text-text-primary mb-4">Endpoints & Capabilities</h2>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {capabilities?.operations?.map(op => (
                  <span key={op} className="px-2.5 py-1 bg-primary-light text-primary border border-primary/20 text-xs font-semibold rounded-md uppercase tracking-wide">
                    {op}
                  </span>
                ))}
                {capabilities?.vision && (
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold rounded-md uppercase tracking-wide flex items-center gap-1">
                    <EyeIcon className="w-3.5 h-3.5" /> Vision
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-text-secondary">Available URLs</h3>
                <div className="space-y-2">
                  {capabilities?.endpoints?.map(url => (
                    <div key={url} className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg group">
                      <span className="font-mono text-xs text-text-primary truncate mr-4">{url}</span>
                      <button 
                        onClick={() => copyToClipboard(url)}
                        className="p-1.5 text-text-tertiary hover:text-primary hover:bg-primary-light rounded-md transition-colors shrink-0"
                        title="Copy URL"
                      >
                        {copiedUrl === url ? <CheckIcon className="w-4 h-4 text-success" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                  {(!capabilities?.endpoints || capabilities.endpoints.length === 0) && (
                    <div className="text-sm text-text-tertiary">No endpoints resolved.</div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Operations Chain */}
            {config.operations && Object.keys(config.operations).length > 0 && (
              <motion.div variants={cardVariants} className="bg-white p-6 rounded-xl border border-border shadow-sm">
                <h2 className="text-base font-semibold text-text-primary mb-4">Operations Chain</h2>
                <div className="space-y-5">
                  {Object.entries(config.operations).map(([mode, models]) => (
                    <div key={mode}>
                      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">{mode}</h3>
                      <div className="space-y-2">
                        {[...models].sort((a, b) => a.priority - b.priority).map((m, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg">
                            <span className="w-5 h-5 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full shrink-0">{m.priority}</span>
                            <span className="font-mono text-sm text-text-primary truncate">{m.litellm_model}</span>
                            <div className="ml-auto flex items-center gap-2 shrink-0">
                              {m.rpm != null && (
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">RPM: {m.rpm}</span>
                              )}
                              {m.tpm != null && (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">TPM: {m.tpm}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Render Custom Operations */}
                  {config.custom_operations && Object.entries(config.custom_operations).map(([opName, opData]) => (
                    <div key={`custom-${opName}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded uppercase">Custom</span>
                        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{opName}</h3>
                      </div>
                      <div className="mb-2 p-3 bg-gray-50 border border-border rounded-lg text-xs text-text-secondary font-mono whitespace-pre-wrap">
                        {opData.description}
                      </div>
                      <div className="space-y-2">
                        {[...opData.models].sort((a, b) => a.priority - b.priority).map((m, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg">
                            <span className="w-5 h-5 flex items-center justify-center bg-primary text-white text-xs font-bold rounded-full shrink-0">{m.priority}</span>
                            <span className="font-mono text-sm text-text-primary truncate">{m.litellm_model}</span>
                            <div className="ml-auto flex items-center gap-2 shrink-0">
                              {m.rpm != null && (
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">RPM: {m.rpm}</span>
                              )}
                              {m.tpm != null && (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">TPM: {m.tpm}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Test Panel */}
            <motion.div variants={cardVariants} className="bg-white p-6 rounded-xl border border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <PlayIcon className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-semibold text-text-primary">Test Endpoint</h2>
                </div>
                <select 
                  value={testEndpoint}
                  onChange={e => setTestEndpoint(e.target.value)}
                  className="px-2 py-1 border border-border rounded text-sm bg-surface font-mono outline-none focus:border-primary"
                >
                  {/* Built-in operations from config */}
                  {capabilities?.operations?.map(op => (
                    <option key={op} value={op}>/{ENDPOINT_MAP[op]?.path || op}</option>
                  ))}
                  {/* Vision (derived, not in operations list) */}
                  {capabilities?.vision && (
                    <option value="vision">/vision</option>
                  )}
                  {/* Custom operations */}
                  {config.custom_operations && Object.keys(config.custom_operations).map(opName => (
                    <option key={`custom-${opName}`} value={opName}>/{opName} (custom)</option>
                  ))}
                </select>
              </div>
              
              <form onSubmit={handleTestSubmit} className="space-y-4">
                <div>
                  <textarea
                    rows={3}
                    required
                    value={testInput}
                    onChange={e => setTestInput(e.target.value)}
                    placeholder="Enter a test prompt..."
                    className="w-full px-4 py-3 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background resize-y"
                  />
                </div>
                <div className="flex justify-end">
                  <button 
                    type="submit" 
                    disabled={testLoading || !testInput.trim()} 
                    className="px-6 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {testLoading ? 'Sending...' : 'Test Endpoint'}
                  </button>
                </div>
              </form>

              <AnimatePresence>
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                    className={`p-4 rounded-lg border ${testResult.ok ? 'bg-surface border-border' : 'bg-red-50 border-red-200 text-danger'}`}
                  >
                    {!testResult.ok ? (
                      <div className="flex gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium">{testResult.text}</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Response</span>
                          <span className="text-xs bg-white border border-border px-2 py-0.5 rounded-md font-mono text-primary">
                            Model: {testResult.model_used || 'unknown'}
                          </span>
                        </div>
                        <div className="text-sm text-text-primary whitespace-pre-wrap font-mono bg-white p-3 rounded border border-border">
                          {testResult.text}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

          </div>

          {/* Sidebar Info Column */}
          <div className="space-y-6">
            
            {/* Usage Stats (Totals) */}
            <motion.div variants={cardVariants} className="bg-white p-6 rounded-xl border border-border shadow-sm">
              <h2 className="text-base font-semibold text-text-primary mb-4">Usage Totals</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-surface rounded-lg">
                  <p className="text-xs font-medium text-text-secondary mb-1">Total Calls</p>
                  <p className="text-xl font-bold text-text-primary">{usage?.totals?.calls || 0}</p>
                </div>
                <div className="p-3 bg-surface rounded-lg">
                  <p className="text-xs font-medium text-text-secondary mb-1">Total Tokens</p>
                  <p className="text-xl font-bold text-text-primary">{usage?.totals?.total_tokens || 0}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs font-medium text-success mb-1">Success</p>
                  <p className="text-xl font-bold text-success">{usage?.totals?.success_count || 0}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-xs font-medium text-danger mb-1">Failed</p>
                  <p className="text-xl font-bold text-danger">{usage?.totals?.failure_count || 0}</p>
                </div>
              </div>
            </motion.div>

            {/* Restrictions & Guardrails */}
            <motion.div variants={cardVariants} className="bg-white p-6 rounded-xl border border-border shadow-sm space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-text-primary mb-3">Restrictions</h2>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between">
                    <span className="text-text-secondary">RPM</span>
                    <span className="font-medium text-text-primary">{config.restrictions?.rpm}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-text-secondary">TPM</span>
                    <span className="font-medium text-text-primary">{config.restrictions?.tpm}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-text-secondary">TPR</span>
                    <span className="font-medium text-text-primary">{config.restrictions?.tpr}</span>
                  </li>
                </ul>
              </div>
              <div className="pt-4 border-t border-border">
                <h2 className="text-sm font-semibold text-text-primary mb-3">Guardrails</h2>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${config.guardrails?.pii_masking ? 'bg-success' : 'bg-danger'}`} />
                    <span className="text-text-primary">PII Masking</span>
                  </li>
                  <li className="flex items-center gap-2 opacity-60">
                    <span className={`w-2 h-2 rounded-full ${config.guardrails?.profanity_filter ? 'bg-success' : 'bg-danger'}`} />
                    <span className="text-text-primary">Profanity Filter</span>
                  </li>
                </ul>
              </div>
            </motion.div>

            {/* Agents Rollup */}
            {usage?.agents && usage.agents.length > 0 && (
              <motion.div variants={cardVariants} className="bg-white p-6 rounded-xl border border-border shadow-sm">
                <h2 className="text-base font-semibold text-text-primary mb-4">Agents Rollup</h2>
                <div className="space-y-3">
                  {usage.agents.map(a => (
                    <div key={a.agent_id} className="flex justify-between items-center text-sm">
                      <span className="font-mono text-primary truncate max-w-[120px]">{a.agent_id}</span>
                      <div className="text-right">
                        <span className="font-medium text-text-primary">{a.calls}</span>
                        <span className="text-xs text-text-tertiary ml-1">calls</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

          </div>
        </div>

        {/* Recent Logs Table */}
        {usage?.recent_logs && usage.recent_logs.length > 0 && (
          <motion.div variants={cardVariants} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden mt-8">
            <div className="px-6 py-5 border-b border-border bg-surface">
              <h2 className="text-base font-semibold text-text-primary">Recent Logs</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-text-secondary uppercase tracking-wider bg-white">
                    <th className="px-6 py-3">Time</th>
                    <th className="px-6 py-3">Endpoint</th>
                    <th className="px-6 py-3">Model</th>
                    <th className="px-6 py-3">Tokens</th>
                    <th className="px-6 py-3">Latency</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usage.recent_logs.map(log => (
                    <tr key={log.id} className="hover:bg-surface transition-colors text-sm">
                      <td className="px-6 py-3 text-text-secondary whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs">{log.endpoint}</td>
                      <td className="px-6 py-3 text-primary truncate max-w-[150px]">{log.model_used || '—'}</td>
                      <td className="px-6 py-3 text-text-secondary">{log.total_tokens || 0}</td>
                      <td className="px-6 py-3 text-text-secondary">{Math.round(log.latency_ms)}ms</td>
                      <td className="px-6 py-3">
                        {log.success ? (
                          <span className="text-success flex items-center gap-1"><CheckIcon className="w-4 h-4"/> OK</span>
                        ) : (
                          <span className="text-danger flex items-center gap-1" title={log.error}><XMarkIcon className="w-4 h-4"/> Err</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
