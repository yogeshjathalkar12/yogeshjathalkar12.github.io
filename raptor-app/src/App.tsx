import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense } from 'react';
import { AuthProvider } from './hooks/AuthContext';
import { ToastProvider } from './hooks/ToastContext';
import { CreditsProvider } from './hooks/CreditsContext';
import { ThemeProvider } from './hooks/ThemeContext';
import { RequireAuth } from './components/RequireAuth';
import Login from './pages/Login';
import DashboardHome from './pages/DashboardHome';
import { DashboardLayout } from './layouts/DashboardLayout';
import { TOOLS } from './tools/registry';

/*crm files */
import CrmLayout from './pages/crm/CrmLayout';
import CrmPipeline from './pages/crm/CrmPipeline';

function ToolFallback() {
  return (
    <div style={{ padding: '3rem', textAlign: 'center' }}>
      <span className="arsenal-spinner" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AuthProvider>
          <ToastProvider>
            <CreditsProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                
                <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
                <Route path="/dashboard" element={<DashboardHome />} />
  
                 {/* Nested CRM Routes */}
                <Route path="/crm" element={<CrmLayout />}>
                <Route index element={<Navigate to="pipeline" replace />} />
                <Route path="overview" element={<div style={{padding: '2rem'}}>Overview Coming Soon</div>} />
                <Route path="pipeline" element={<CrmPipeline />} />
                <Route path="contacts" element={<div style={{padding: '2rem'}}>Contacts Coming Soon</div>} />
                <Route path="activity" element={<div style={{padding: '2rem'}}>Activity Coming Soon</div>} />
                <Route path="automations" element={<div style={{padding: '2rem'}}>Automations Coming Soon</div>} />
              </Route>  
                  {TOOLS.map((tool) => {
                    const ToolComponent = tool.component;
                    return (
                      <Route
                        key={tool.slug}
                        path={tool.route}
                        element={
                          <Suspense fallback={<ToolFallback />}>
                            <ToolComponent />
                          </Suspense>
                        }
                      />
                    );
                  })}
                </Route>
                
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </CreditsProvider>
          </ToastProvider>
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  );
}