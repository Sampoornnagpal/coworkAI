import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { CloudArrowUpIcon, TrashIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline';

const tableRowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({
    opacity: 1, x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30, delay: i * 0.05 }
  }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

export default function Upload() {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const load = () => api.get('/rag/documents').then(r => setDocs(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true); setMsg(null);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await api.post('/rag/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg({ ok: true, text: `"${r.data.filename}" uploaded — ${r.data.chunk_count} chunks indexed` });
      load();
    } catch (err) { 
      setMsg({ ok: false, text: err.response?.data?.detail || 'Upload failed' }); 
    } finally { 
      setUploading(false); 
      if (fileRef.current) fileRef.current.value = ''; 
    }
  };

  const del = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from the knowledge base?`)) return;
    try { 
      await api.delete(`/rag/documents/${id}`); 
      setMsg({ ok: true, text: `Deleted "${name}"` }); 
      load(); 
    } catch (err) { 
      setMsg({ ok: false, text: err.response?.data?.detail || 'Delete failed' }); 
    }
  };

  const isPdf = (name) => name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Header */}
      <motion.header 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="h-[64px] shrink-0 px-6 lg:px-8 flex items-center justify-between border-b border-border bg-white z-10 sticky top-0"
      >
        <h1 className="text-lg font-semibold text-text-primary">Knowledge Base</h1>
      </motion.header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 lg:px-8 py-8">
        
        <AnimatePresence>
          {msg && (
            <motion.div 
              initial={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 24 }}
              exit={{ opacity: 0, y: -10, height: 0, marginBottom: 0 }}
              className={`p-4 rounded-btn text-sm font-medium flex items-center justify-between overflow-hidden shadow-sm ${msg.ok ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-danger border border-red-200'}`}
            >
              <span>{msg.text}</span>
              <button onClick={() => setMsg(null)} className="opacity-70 hover:opacity-100">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drop Zone */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.1 }}
          whileHover={{ scale: 1.01, borderColor: '#6366f1' }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }} 
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]); }}
          className={`border-2 border-dashed rounded-xl p-12 text-center mb-10 transition-colors duration-200 flex flex-col items-center justify-center min-h-[240px] ${
            dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border bg-surface hover:border-primary/50'
          }`}
        >
          <motion.div 
            animate={uploading ? { rotate: 360 } : { y: [-2, 2] }}
            transition={uploading ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 text-primary"
          >
            {uploading ? (
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <CloudArrowUpIcon className="w-8 h-8" />
            )}
          </motion.div>
          <h3 className="text-base font-semibold text-text-primary mb-1">
            {uploading ? 'Processing document...' : 'Drop files here or click to upload'}
          </h3>
          <p className="text-sm text-text-secondary mb-6">Supports PDF and TXT files. Documents will be indexed for AI search.</p>
          
          <input ref={fileRef} type="file" accept=".pdf,.txt" onChange={e => upload(e.target.files[0])} className="hidden" />
          
          <motion.button 
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => fileRef.current?.click()} 
            disabled={uploading}
            className="px-6 py-2.5 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 shadow-sm"
          >
            Browse Files
          </motion.button>
        </motion.div>

        {/* Doc List */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.2 }}
          className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border bg-surface flex justify-between items-center">
            <h2 className="text-sm font-semibold text-text-primary">Uploaded Documents ({docs.length})</h2>
          </div>
          
          {docs.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-12 text-center text-text-tertiary text-sm">
              No documents have been uploaded to your team's knowledge base yet.
            </motion.div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-text-secondary uppercase tracking-wider">
                  <th className="px-6 py-3">Document Name</th>
                  <th className="px-6 py-3">Chunks</th>
                  <th className="px-6 py-3">Uploaded By</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence>
                  {docs.map((d, i) => (
                    <motion.tr 
                      key={d.id} 
                      custom={i}
                      variants={tableRowVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="hover:bg-surface transition-colors group"
                    >
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary-light text-primary flex items-center justify-center shrink-0">
                          {isPdf(d.filename) ? (
                            <span className="text-[10px] font-bold">PDF</span>
                          ) : (
                            <DocumentTextIcon className="w-5 h-5" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-text-primary truncate max-w-[300px]" title={d.filename}>
                          {d.filename}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        <span className="px-2 py-1 bg-surface border border-border rounded-badge text-xs font-medium">
                          {d.chunk_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {d.uploaded_by || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {new Date(d.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <motion.button 
                          whileHover={{ scale: 1.1, backgroundColor: 'rgba(239,68,68,0.05)' }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => del(d.id, d.filename)} 
                          className="p-1.5 text-text-tertiary hover:text-danger rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" 
                          title="Delete Document"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </motion.div>
      </div>
    </div>
  );
}
