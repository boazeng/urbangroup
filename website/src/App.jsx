import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import AppPage from './pages/AppPage'
import UrbanEnergyPage from './pages/UrbanEnergyPage'
import InvoicesPage from './pages/InvoicesPage'
import MaintenancePage from './pages/MaintenancePage'
import MessagesPage from './pages/MessagesPage'
import ServiceCallsPage from './pages/ServiceCallsPage'

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/maintenance/messages" element={<MessagesPage />} />
          <Route path="/maintenance/service-calls" element={<ServiceCallsPage />} />
          <Route path="/app/urban-energy" element={<UrbanEnergyPage />} />
          <Route path="/app/urban-energy/invoices" element={<InvoicesPage />} />
          <Route path="/app/:appId" element={<AppPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
