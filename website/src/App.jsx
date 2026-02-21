import { Routes, Route } from 'react-router-dom'
import { EnvProvider } from './contexts/EnvContext'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import AppPage from './pages/AppPage'
import InvoicesPage from './pages/InvoicesPage'
import EnergyPage from './pages/EnergyPage'
import AppsPage from './pages/AppsPage'
import SupplierInvoicesPage from './pages/SupplierInvoicesPage'
import InvoicePrinterPage from './pages/InvoicePrinterPage'
import MaintenancePage from './pages/MaintenancePage'
import MessagesPage from './pages/MessagesPage'
import ServiceCallsPage from './pages/ServiceCallsPage'
import ArielPage from './pages/ArielPage'
import AgingReportPage from './pages/AgingReportPage'
import ArielDebtReportPage from './pages/ArielDebtReportPage'
import ArielUnchargedDeliveryPage from './pages/ArielUnchargedDeliveryPage'
import ArielInvoicesPage from './pages/ArielInvoicesPage'
import PdfToolsPage from './pages/PdfToolsPage'
import SupplierInvoiceEntryPage from './pages/SupplierInvoiceEntryPage'

export default function App() {
  return (
    <EnvProvider>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/maintenance/messages" element={<MessagesPage />} />
          <Route path="/maintenance/service-calls" element={<ServiceCallsPage />} />
          <Route path="/ariel" element={<ArielPage />} />
          <Route path="/ariel/aging-report" element={<AgingReportPage />} />
          <Route path="/ariel/debt-report" element={<ArielDebtReportPage />} />
          <Route path="/ariel/uncharged-delivery" element={<ArielUnchargedDeliveryPage />} />
          <Route path="/ariel/invoices" element={<ArielInvoicesPage />} />
          <Route path="/energy" element={<EnergyPage />} />
          <Route path="/energy/invoices" element={<InvoicesPage />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/apps/supplier-invoices" element={<SupplierInvoicesPage />} />
          <Route path="/apps/supplier-invoice-entry" element={<SupplierInvoiceEntryPage />} />
          <Route path="/apps/invoice-printer" element={<InvoicePrinterPage />} />
          <Route path="/apps/pdf-tools" element={<PdfToolsPage />} />
          <Route path="/app/:appId" element={<AppPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <Footer />
    </EnvProvider>
  )
}
