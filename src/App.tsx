import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Templates from './components/Inventory/Templates';
import Production from './components/Production';
import Orders from './components/Orders';
import Invoices from './components/Invoices';
import Waybills from './components/Waybills';
import Accounting from './components/Accounting';
import Finance from './components/Finance';
import Contacts from './components/Contacts';
import HRManagement from './components/HR';
import UsersManagement from './components/Users';
import ReportsHub from './components/Reports';
import StockSummaryReport from './components/Reports/StockSummaryReport';
import StockDetailReport from './components/Reports/StockDetailReport';
import StockMovementReport from './components/Reports/StockMovementReport';
import BrokenSizeReport from './components/Reports/BrokenSizeReport';
import SettingsHub from './components/Settings';
import { erpService } from './services/erpService';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeedbackHost } from './lib/feedback';

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="shoerp-theme">
      <AuthProvider>
        <FeedbackHost />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="inventory/templates" element={<Templates />} />
            
            <Route path="reports" element={<ReportsHub />} />
            <Route path="reports/summary" element={<StockSummaryReport />} />
            <Route path="reports/detail" element={<StockDetailReport />} />
            <Route path="reports/movements" element={<StockMovementReport />} />
            <Route path="reports/broken" element={<BrokenSizeReport />} />
            
            <Route path="production" element={<Production />} />
            <Route path="orders" element={<Orders />} />
            <Route path="waybills" element={<Waybills />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="finance" element={<Finance />} />
            <Route path="accounting" element={<Accounting />} />
            <Route path="hr" element={<HRManagement />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="users" element={<UsersManagement />} />
            <Route path="settings" element={<SettingsHub />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
