import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import configApi from './configApi';
import { 
  PlusIcon, 
  TrashIcon, 
  PencilSquareIcon, 
  EyeIcon, 
  ExclamationTriangleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const rowVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({ 
    opacity: 1, x: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30, delay: i * 0.05 }
  })
};

export default function ConfiguratorList() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [deletingConfig, setDeletingConfig] = useState(null);
  const navigate = useNavigate();

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await configApi.get('/configs');
      setConfigs(data);
    } catch (err) {
      setMsg({ ok: false, text: 'Failed to load configurations' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleDelete = async (fullName) => {
    try {
      await configApi.delete(`/configs/${fullName}`);
      setMsg({ ok: true, text: `Configuration ${fullName} deleted successfully.` });
      setDeletingConfig(null);
      loadConfigs();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const text = typeof detail === 'string' ? detail : 'Failed to delete config';
      setMsg({ ok: false, text });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="h-[64px] shrink-0 px-6 lg:px-8 flex items-center justify-between border-b border-border bg-white z-10 sticky top-0"
      >
        <h1 className="text-lg font-semibold text-text-primary">LLM Configurator</h1>
        <motion.button 
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/llm-configurator/new')}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-btn text-sm font-medium hover:bg-primary-hover transition-colors shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Create Config
        </motion.button>
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

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deletingConfig && (
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
                  Are you sure you want to delete <span className="font-semibold">{deletingConfig}</span>? 
                  <br /><br />
                  <span className="font-bold">WARNING:</span> The endpoint will die immediately.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeletingConfig(null)}
                    className="px-4 py-2 bg-surface text-text-secondary rounded-btn text-sm font-medium hover:bg-background border border-border transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deletingConfig)}
                    className="px-4 py-2 bg-danger text-white rounded-btn text-sm font-medium hover:bg-red-700 transition-all"
                  >
                    Delete
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Configs Table */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.2 }}
          className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-border bg-surface">
            <h2 className="text-base font-semibold text-text-primary">Active Configurations</h2>
          </div>
          
          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="flex gap-2">
                {[0,.2,.4].map(d => <motion.div key={d} animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.2, repeat: Infinity, delay: d }} className="w-3 h-3 rounded-full bg-primary" />)}
              </div>
            </div>
          ) : configs.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-tertiary">No configurations found. Create one to get started.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-text-secondary uppercase tracking-wider bg-white">
                    <th className="px-6 py-4">Full Name</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">RPM</th>
                    <th className="px-6 py-4">TPR</th>
                    <th className="px-6 py-4">Operations</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <motion.tbody className="divide-y divide-border" variants={staggerContainer} initial="hidden" animate="visible">
                  {configs.map((c, i) => (
                    <motion.tr
                      key={c.full_name}
                      custom={i}
                      variants={rowVariants}
                      className="hover:bg-surface transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link to={`/llm-configurator/${c.full_name}`} className="font-medium text-primary hover:underline">
                          {c.full_name}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-badge ${
                          c.status === 'active' ? 'bg-green-50 text-success border border-green-200' : 'bg-surface text-text-tertiary border border-border'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {c.restrictions ? c.restrictions.rpm : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {c.restrictions ? c.restrictions.tpr : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {c.operations_present?.map(op => (
                            <span key={op} className="px-2 py-0.5 bg-primary-light text-primary border border-primary/20 text-[10px] font-semibold rounded-md">
                              {op}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link 
                            to={`/llm-configurator/${c.full_name}`}
                            className="p-1.5 text-text-tertiary hover:bg-surface hover:text-primary rounded-md transition-colors"
                            title="View"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </Link>
                          <Link 
                            to={`/llm-configurator/${c.full_name}/edit`}
                            className="p-1.5 text-text-tertiary hover:bg-surface hover:text-primary rounded-md transition-colors"
                            title="Edit"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </Link>
                          <button 
                            onClick={() => setDeletingConfig(c.full_name)}
                            className="p-1.5 text-text-tertiary hover:bg-red-50 hover:text-danger rounded-md transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
