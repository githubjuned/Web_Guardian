import { Route, Routes } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { LandingPage } from './pages/LandingPage';
import { NewAuditPage } from './pages/NewAuditPage';
import { AuditPage } from './pages/AuditPage';
import { AuditsListPage } from './pages/AuditsListPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="audit" element={<NewAuditPage />} />
        <Route path="audits" element={<AuditsListPage />} />
        <Route path="audits/:id" element={<AuditPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
