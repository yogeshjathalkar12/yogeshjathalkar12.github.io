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
import CrmLayout from './layouts/CrmLayout';
import CrmOverview from './pages/crm/CrmOverview';
import CrmPipeline from './pages/crm/CrmPipeline';
import CrmContacts from './pages/crm/CrmContacts';
import CrmActivity from './pages/crm/CrmActivity';
import CrmAutomations from './pages/crm/CrmAutomations';
import CrmCampaigns from './pages/crm/CrmCampaigns';

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

                 <Route path="/crm" element={<CrmLayout />}>
                 <Route index element={<Navigate to="pipeline" replace />} />
                 <Route path="overview" element={<CrmOverview />} />
                 <Route path="pipeline" element={<CrmPipeline />} />
                 <Route path="contacts" element={<CrmContacts />} />
                <Route path="activity" element={<CrmActivity />} />
                <Route path="automations" element={<CrmAutomations />} />
                <Route path="campaigns" element={<CrmCampaigns />} />
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