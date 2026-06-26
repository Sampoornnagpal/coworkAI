import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { ChatBubbleLeftIcon, ArrowUpTrayIcon, ChartBarIcon, ArrowRightOnRectangleIcon, CpuChipIcon, LinkIcon, UserGroupIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';

const sidebarVariants = {
  hidden: { x: -240 },
  visible: {
    x: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
};

const logoVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25, delay: 0.1 },
  },
};

const navContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.15 },
  },
};

const navItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
};

const userSectionVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, ease: 'easeOut', delay: 0.3 },
  },
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Chat', path: '/', icon: ChatBubbleLeftIcon },
    { name: 'Upload Documents', path: '/upload', icon: ArrowUpTrayIcon },
    { name: 'Models', path: '/models', icon: CpuChipIcon },
  ];

  if (user?.role === 'admin') {
    navItems.push({ name: 'Admin Dashboard', path: '/admin', icon: ChartBarIcon });
    navItems.push({ name: 'MCP Servers', path: '/mcp-servers', icon: LinkIcon });
    navItems.push({ name: 'Agents', path: '/agents', icon: UserGroupIcon });
    navItems.push({ name: 'LLM Configs', path: '/llm-configurator', icon: AdjustmentsHorizontalIcon });
    navItems.push({ name: 'LLM Catalogue', path: '/llm-catalogue', icon: CpuChipIcon });
  }

  return (
    <motion.div
      className="w-[240px] flex-shrink-0 bg-white border-r border-border flex flex-col h-[100dvh] fixed left-0 top-0"
      variants={sidebarVariants}
      initial="hidden"
      animate="visible"
    >
      {/* App Logo & Team Name */}
      <motion.div
        className="p-6 border-b border-border"
        variants={logoVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-lg">
            AI
          </div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">AI Cowork</h1>
        </div>
        {user?.team_name && (
          <div className="text-sm font-medium text-text-secondary mt-2 px-2 py-1 bg-surface rounded-md inline-block">
            {user.team_name} Team
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <motion.nav
        className="flex-1 p-4 space-y-1 overflow-y-auto"
        variants={navContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <motion.div key={item.name} variants={navItemVariants}>
              <Link
                to={item.path}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-btn font-medium transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-nav"
                    className="absolute inset-0 bg-primary-light rounded-btn"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative flex items-center gap-3">
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-text-tertiary'}`} />
                  {item.name}
                </span>
              </Link>
            </motion.div>
          );
        })}
      </motion.nav>

      {/* User Info & Logout */}
      <motion.div
        className="p-4 border-t border-border mt-auto"
        variants={userSectionVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center font-bold">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{user?.name}</p>
            <p className="text-xs text-text-secondary truncate">{user?.email}</p>
          </div>
        </div>
        <motion.button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:text-danger hover:bg-red-50 rounded-btn transition-colors"
          whileHover={{ x: 4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          Sign Out
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
