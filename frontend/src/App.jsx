import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Upload from './pages/Upload';
import Admin from './pages/Admin';
import Models from './pages/Models';
import MCPServers from './pages/MCPServers';
import Agents from './pages/Agents';

function Protected({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex gap-2">
          {[0, 0.2, 0.4].map(d => (
            <div 
              key={d} 
              className="w-3 h-3 rounded-full bg-primary" 
              style={{ animation: 'pulse-dot 1.2s infinite', animationDelay: `${d}s` }}
            />
          ))}
        </div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-background text-text-primary flex">
      {user && <Sidebar />}
      <div className={`flex-1 flex flex-col min-h-screen ${user ? 'ml-[240px]' : ''}`}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/" element={<Protected><Chat /></Protected>} />
          <Route path="/upload" element={<Protected><Upload /></Protected>} />
          <Route path="/admin" element={<Protected><Admin /></Protected>} />
          <Route path="/models" element={<Protected><Models /></Protected>} />
          <Route path="/mcp-servers" element={<Protected><MCPServers /></Protected>} />
          <Route path="/agents" element={<Protected><Agents /></Protected>} />
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </div>
    </div>
  );
}
