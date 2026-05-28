import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import ChatMessage from '../components/ChatMessage';
import { PaperAirplaneIcon, Cog8ToothIcon, DocumentTextIcon, DocumentMagnifyingGlassIcon, ServerIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';

const suggestionContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.3 }
  }
};

const suggestionCardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 28 } }
};

const dotVariants = {
  initial: { y: 0 },
  animate: { y: -6 }
};

const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
  exit: { opacity: 0, scale: 0.92, y: 20, transition: { duration: 0.2 } }
};

export default function Chat() {
  const [messages, setMessages] = useState(() => {
    const saved = sessionStorage.getItem('chat_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [mcpServers, setMcpServers] = useState([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState('');
  const [a2aAgents, setA2aAgents] = useState([]);
  const [selectedA2aAgent, setSelectedA2aAgent] = useState('');
  const [useDocs, setUseDocs] = useState(false);
  const [usage, setUsage] = useState(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditReason, setCreditReason] = useState('');
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditMsg, setCreditMsg] = useState(null);
  
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const loadUsage = () => api.get('/chat/usage').then(r => setUsage(r.data)).catch(() => {});

  useEffect(() => {
    api.get('/models/active').then(r => {
      setModels(r.data.models);
      if (r.data.models.length && !selectedModel) setSelectedModel(r.data.models[0].model_string);
    }).catch(() => {});
    api.get('/mcp/servers').then(r => {
      setMcpServers(r.data.servers || []);
    }).catch(() => {});
    api.get('/a2a/agents').then(r => {
      setA2aAgents(r.data.agents || []);
    }).catch(() => {});
    loadUsage();
  }, []);

  useEffect(() => { 
    sessionStorage.setItem('chat_messages', JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    
    const q = input.trim();
    setInput('');
    setMessages(p => [...p, { role: 'user', content: q }]);
    setLoading(true);
    
    try {
      const modelToUse = selectedA2aAgent || selectedModel || undefined;
      const r = await api.post('/chat/ask', { question: q, model: modelToUse, use_documents: useDocs });
      setMessages(p => [...p, { role: 'assistant', content: r.data.answer, sources: r.data.sources }]);
      loadUsage();
    } catch (err) {
      if (err.response?.status === 429) {
        setMessages(p => [...p, { role: 'assistant', content: '⚠️ Your team has exhausted its monthly token budget. Please request more credits from your admin.', sources: [], isError: true }]);
        setShowCreditModal(true);
      } else {
        setMessages(p => [...p, { role: 'assistant', content: err.response?.data?.detail || 'Something went wrong.', sources: [], isError: true }]);
      }
    } finally { 
      setLoading(false); 
      inputRef.current?.focus(); 
    }
  };

  const submitCreditRequest = async () => {
    setCreditSubmitting(true); setCreditMsg(null);
    try {
      await api.post('/credit/request', { reason: creditReason });
      setCreditMsg({ ok: true, text: 'Request submitted! Your admin will review it.' });
      setCreditReason('');
      loadUsage();
    } catch (err) {
      setCreditMsg({ ok: false, text: err.response?.data?.detail || 'Failed to submit request' });
    } finally { setCreditSubmitting(false); }
  };

  const suggest = (q) => { setInput(q); inputRef.current?.focus(); };
  
  const usagePct = usage ? Math.min(100, usage.percentage) : 0;
  const isExhausted = usage?.exhausted;

  return (
    <div className="flex flex-col h-full bg-background relative">
      
      {/* Top Header */}
      <motion.header
        className="h-[64px] shrink-0 px-6 flex items-center justify-between border-b border-border bg-white z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-lg font-semibold text-text-primary">Chat Workspace</h2>
        
        <div className="flex items-center gap-6">
          <AnimatePresence>
            {messages.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 10 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setMessages([]);
                  sessionStorage.removeItem('chat_messages');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-text-secondary hover:text-text-primary rounded-btn text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                id="clear-chat-btn"
              >
                <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Reset Chat
              </motion.button>
            )}
          </AnimatePresence>

          {usage && (
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-1">
                  Monthly Budget
                </span>
                <div className="flex items-center gap-3 w-[200px]">
                  <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden shadow-inner">
                    <div className={`h-full rounded-full transition-all duration-500 ${isExhausted ? 'bg-danger' : usagePct > 80 ? 'bg-warning' : 'bg-primary'}`}
                      style={{width:`${usagePct}%`}} />
                  </div>
                  <span className={`text-[11px] font-medium ${isExhausted ? 'text-danger' : 'text-text-primary'}`}>
                    {usagePct.toFixed(0)}%
                  </span>
                </div>
              </div>
              {isExhausted && !usage.has_pending_request && (
                <button onClick={() => setShowCreditModal(true)} className="px-3 py-1.5 bg-danger text-white rounded-btn text-xs font-semibold hover:bg-red-700 transition-colors">
                  Request Credits
                </button>
              )}
              {usage.has_pending_request && (
                <span className="px-3 py-1.5 bg-surface text-text-tertiary rounded-btn text-xs font-medium border border-border">
                  Request Pending
                </span>
              )}
            </div>
          )}
        </div>
      </motion.header>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-8 bg-surface">
        <div className="max-w-4xl mx-auto flex flex-col min-h-full">
          
          {messages.length === 0 ? (
            /* Empty State */
            <motion.div
              className="flex-1 flex flex-col items-center justify-center text-center mb-12"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <motion.div
                className="w-16 h-16 rounded-2xl bg-white border border-border flex items-center justify-center mb-6 shadow-sm"
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
              >
                <SparklesIcon className="w-8 h-8 text-primary" />
              </motion.div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">Ask anything about your team's documents</h2>
              <p className="text-text-secondary max-w-md mb-8">
                Your AI assistant has context on all uploaded documents. Ask a question, request a summary, or draft new content.
              </p>
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg"
                variants={suggestionContainerVariants}
                initial="hidden"
                animate="visible"
              >
                {['Summarize the latest product requirements', 'What is our vacation policy?', 'Draft an email to the marketing team', 'Explain the deployment pipeline'].map(q => (
                  <motion.button
                    key={q}
                    variants={suggestionCardVariants}
                    whileHover={{ scale: 1.03, borderColor: 'var(--color-primary)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => suggest(q)}
                    className="text-left px-4 py-3 bg-white border border-border rounded-xl text-sm text-text-primary hover:shadow-sm transition-shadow hover:text-primary"
                  >
                    {q}
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            /* Message List */
            <div className="flex-1 pb-4">
              {messages.map((m, i) => <ChatMessage key={i} message={m} />)}
              
              <AnimatePresence>
                {loading && (
                  <motion.div
                    className="flex justify-start mb-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  >
                    <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-1.5 h-[52px]">
                      {[0, 0.15, 0.3].map(d => (
                        <motion.div
                          key={d}
                          className="w-1.5 h-1.5 rounded-full bg-text-tertiary"
                          variants={dotVariants}
                          initial="initial"
                          animate="animate"
                          transition={{
                            duration: 0.45,
                            repeat: Infinity,
                            repeatType: 'reverse',
                            ease: 'easeInOut',
                            delay: d
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Bar */}
      <motion.div
        className="bg-white border-t border-border p-4 lg:px-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.15 }}
      >
        <div className="max-w-4xl mx-auto">
          <form onSubmit={send} className="relative flex flex-col border border-border bg-white rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all overflow-hidden">
            <textarea 
              ref={inputRef} 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              disabled={loading || isExhausted}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(e);
                }
              }}
              placeholder={isExhausted ? "Token budget exhausted — request more credits" : "Ask anything... (Press Enter to send)"}
              className="w-full px-4 pt-4 pb-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none resize-none min-h-[64px] max-h-[200px] disabled:bg-surface disabled:cursor-not-allowed" 
              rows={1}
            />
            
            <div className="flex items-center justify-between px-3 py-2 bg-white">
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <div className="relative group">
                  <select 
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="appearance-none pl-8 pr-6 py-1.5 bg-surface border border-transparent rounded-btn text-xs font-medium text-text-secondary cursor-pointer hover:border-border hover:bg-white transition-all outline-none"
                  >
                    {Object.entries(
                      models.reduce((acc, m) => {
                        (acc[m.provider] = acc[m.provider] || []).push(m);
                        return acc;
                      }, {})
                    ).map(([provider, providerModels]) => (
                      <optgroup key={provider} label={provider.toUpperCase()}>
                        {providerModels.map(m => (
                          <option key={m.model_string} value={m.model_string}>{m.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <Cog8ToothIcon className="w-4 h-4 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* MCP Server Selector */}
                {mcpServers.length > 0 && (
                  <div className="relative group">
                    <select 
                      value={selectedMcpServer}
                      onChange={e => setSelectedMcpServer(e.target.value)}
                      className="appearance-none pl-8 pr-6 py-1.5 bg-surface border border-transparent rounded-btn text-xs font-medium text-text-secondary cursor-pointer hover:border-border hover:bg-white transition-all outline-none"
                    >
                      <option value="">No MCP Tools</option>
                      {mcpServers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ServerIcon className="w-4 h-4 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}

                {/* A2A Agent Selector */}
                {a2aAgents.length > 0 && (
                  <div className="relative group">
                    <select 
                      value={selectedA2aAgent}
                      onChange={e => setSelectedA2aAgent(e.target.value)}
                      className="appearance-none pl-8 pr-6 py-1.5 bg-surface border border-transparent rounded-btn text-xs font-medium text-text-secondary cursor-pointer hover:border-border hover:bg-white transition-all outline-none"
                    >
                      <option value="">No Agent</option>
                      {a2aAgents.filter(a => a.model_string).map(a => (
                        <option key={a.id} value={a.model_string}>{a.agent_name}</option>
                      ))}
                    </select>
                    <SparklesIcon className="w-4 h-4 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
                
                {/* Document Toggle */}
                <button 
                  type="button" 
                  onClick={() => setUseDocs(!useDocs)} 
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn text-xs font-medium transition-colors ${
                    useDocs ? 'bg-primary-light text-primary border border-primary/20' : 'bg-surface text-text-secondary border border-transparent hover:border-border hover:bg-white'
                  }`}
                >
                  {useDocs ? <DocumentMagnifyingGlassIcon className="w-4 h-4" /> : <DocumentTextIcon className="w-4 h-4 opacity-50" />}
                  {useDocs ? 'Search Docs' : 'No Docs'}
                </button>
              </div>
              
              <motion.button 
                type="submit" 
                disabled={loading || !input.trim() || isExhausted}
                className="w-8 h-8 rounded-btn bg-primary text-white flex items-center justify-center hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9, rotate: 45 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </motion.button>
            </div>
          </form>
          <div className="text-center mt-2">
            <span className="text-[10px] text-text-tertiary">AI may produce inaccurate information about people, places, or facts.</span>
          </div>
        </div>
      </motion.div>

      {/* Credit Request Modal */}
      <AnimatePresence>
        {showCreditModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 backdrop-blur-sm p-4"
            variants={modalOverlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowCreditModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-md p-6"
              variants={modalContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-text-primary mb-2">Request More Credits</h3>
              <p className="text-sm text-text-secondary mb-6">Your admin will review your request and decide the token amount to allocate to your team.</p>
              
              {creditMsg && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${creditMsg.ok ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'}`}>
                  {creditMsg.text}
                </div>
              )}

              {!creditMsg?.ok && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Reason (optional)</label>
                    <textarea 
                      value={creditReason} 
                      onChange={e => setCreditReason(e.target.value)} 
                      rows={3} 
                      placeholder="e.g. Need more tokens for Q4 report analysis..."
                      className="w-full px-3.5 py-2.5 rounded-btn border border-border bg-background text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none" 
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowCreditModal(false)} 
                      className="flex-1 py-2 bg-surface border border-border text-text-primary rounded-btn text-sm font-medium hover:bg-background transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={submitCreditRequest} 
                      disabled={creditSubmitting || usage?.has_pending_request} 
                      className="flex-[2] py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                    >
                      {creditSubmitting ? 'Submitting...' : usage?.has_pending_request ? 'Pending...' : 'Submit Request'}
                    </button>
                  </div>
                </div>
              )}

              {creditMsg?.ok && (
                <button 
                  onClick={() => { setShowCreditModal(false); setCreditMsg(null); }}
                  className="w-full py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  Close
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
