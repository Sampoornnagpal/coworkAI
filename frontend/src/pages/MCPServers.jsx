import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { LinkIcon, TrashIcon, PlayIcon, PlusIcon, XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Navigate } from 'react-router-dom';

export default function MCPServers() {
  const { user } = useAuth();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  
  // New server form
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    transport_type: 'http',
    auth_type: 'none',
    auth_value: ''
  });

  // Tools discovery
  const [toolsState, setToolsState] = useState({}); // { serverId: { loading: bool, error: str, tools: [] } }

  const loadServers = () => {
    setLoading(true);
    api.get('/mcp/servers')
      .then(r => setServers(r.data.servers))
      .catch(() => setMsg({ ok: false, text: 'Failed to load MCP servers' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.role === 'admin') loadServers();
  }, [user]);

  if (user?.role !== 'admin') {
    return <Navigate to="/chat" replace />;
  }

  const handleAddServer = async (e) => {
    e.preventDefault();
    setAdding(true);
    setMsg(null);
    try {
      await api.post('/mcp/servers', formData);
      setMsg({ ok: true, text: `Server "${formData.name}" connected successfully` });
      setShowAddForm(false);
      setFormData({ name: '', url: '', transport_type: 'http', auth_type: 'none', auth_value: '' });
      loadServers();
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to connect server' });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to disconnect ${name}?`)) return;
    try {
      await api.delete(`/mcp/servers/${id}`);
      setMsg({ ok: true, text: `Server "${name}" deleted` });
      loadServers();
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Failed to delete server' });
    }
  };

  const testConnection = async (id) => {
    setToolsState(prev => ({ ...prev, [id]: { loading: true, error: null, tools: null } }));
    try {
      const res = await api.get(`/mcp/servers/${id}/tools`);
      setToolsState(prev => ({ ...prev, [id]: { loading: false, error: null, tools: res.data.tools } }));
    } catch (err) {
      setToolsState(prev => ({ ...prev, [id]: { loading: false, error: err.response?.data?.detail || 'Connection failed', tools: null } }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Header */}
      <header className="h-[64px] shrink-0 px-6 lg:px-8 flex items-center justify-between border-b border-border bg-white z-10 sticky top-0">
        <h1 className="text-lg font-semibold text-text-primary">MCP Servers</h1>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Add MCP Server
        </button>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 lg:px-8 py-8 space-y-8">
        
        {msg && (
          <div className={`p-4 rounded-btn text-sm font-medium anim-fade flex items-center justify-between shadow-sm ${msg.ok ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'}`}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Add Server Form */}
        {showAddForm && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-6 anim-slide">
            <h2 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-text-secondary" />
              Connect New Server
            </h2>
            <form onSubmit={handleAddServer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-secondary">Server Name</label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    required 
                    placeholder="e.g. DeepWiki"
                    className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-secondary">Server URL</label>
                  <input 
                    type="url" 
                    value={formData.url} 
                    onChange={e => setFormData({...formData, url: e.target.value})} 
                    required 
                    placeholder="https://mcp.deepwiki.com/mcp"
                    className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-secondary">Transport Type</label>
                  <select 
                    value={formData.transport_type} 
                    onChange={e => setFormData({...formData, transport_type: e.target.value})}
                    className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer" 
                  >
                    <option value="http">HTTP POST</option>
                    <option value="sse">SSE (Server-Sent Events)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-secondary">Auth Type</label>
                  <select 
                    value={formData.auth_type} 
                    onChange={e => setFormData({...formData, auth_type: e.target.value, auth_value: ''})}
                    className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer" 
                  >
                    <option value="none">None</option>
                    <option value="bearer_token">Bearer Token</option>
                    <option value="api_key">API Key (Header)</option>
                  </select>
                </div>
                {formData.auth_type !== 'none' && (
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-text-secondary">Auth Value</label>
                    <input 
                      type="password" 
                      value={formData.auth_value} 
                      onChange={e => setFormData({...formData, auth_value: e.target.value})} 
                      required 
                      placeholder="Enter token or key..."
                      className="w-full px-4 py-2 bg-background border border-border rounded-btn text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" 
                    />
                  </div>
                )}
              </div>
              <div className="pt-2 flex gap-3">
                <button 
                  type="submit" 
                  disabled={adding} 
                  className="px-6 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-all disabled:opacity-50"
                >
                  {adding ? 'Connecting...' : 'Connect Server'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)}
                  className="px-6 py-2 bg-surface text-text-secondary rounded-btn text-sm font-medium hover:bg-background border border-border transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Servers List */}
        <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-surface flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Connected Servers</h2>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex gap-2">
                {[0,.2,.4].map(d => <div key={d} className="w-3 h-3 rounded-full bg-primary" style={{animation:'pulse-dot 1.2s infinite',animationDelay:`${d}s`}}/>)}
              </div>
            </div>
          ) : servers.length === 0 ? (
            <div className="p-12 text-center text-text-tertiary text-sm">
              No MCP servers connected yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {servers.map(s => {
                const state = toolsState[s.id] || {};
                
                return (
                  <div key={s.id} className="p-6 anim-fade">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-bold text-text-primary">{s.name}</h3>
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface border border-border rounded-full">
                            {s.transport_type}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary font-mono">{s.url}</p>
                        <p className="text-[11px] text-text-tertiary mt-2">Added on {new Date(s.created_at).toLocaleDateString()}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => testConnection(s.id)}
                          disabled={state.loading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-light text-primary border border-primary/20 rounded-btn text-xs font-semibold hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                        >
                          <PlayIcon className="w-4 h-4" />
                          {state.loading ? 'Testing...' : 'Test Connection'}
                        </button>
                        <button 
                          onClick={() => handleDelete(s.id, s.name)}
                          className="p-1.5 text-text-tertiary hover:text-danger hover:bg-red-50 rounded-md transition-colors border border-transparent hover:border-red-100"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Discovery Results */}
                    {(state.tools || state.error) && (
                      <div className={`mt-4 p-4 rounded-lg border anim-slide ${state.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        {state.error ? (
                          <div className="flex items-center gap-2 text-danger text-sm font-medium">
                            <ExclamationTriangleIcon className="w-5 h-5" />
                            {state.error}
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-bold text-success mb-3 flex items-center gap-2">
                              <CheckCircleIcon className="w-5 h-5" />
                              Discovered {state.tools.length} tool{state.tools.length !== 1 && 's'}
                            </p>
                            <div className="space-y-3">
                              {state.tools.map((t, idx) => (
                                <div key={idx} className="bg-white border border-green-100 p-3 rounded-md shadow-sm">
                                  <p className="text-sm font-bold text-text-primary mb-1">{t.name}</p>
                                  <p className="text-xs text-text-secondary">{t.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
