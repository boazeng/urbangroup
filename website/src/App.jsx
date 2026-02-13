import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import AppPage from './pages/AppPage'
import UrbanEnergyPage from './pages/UrbanEnergyPage'
import InvoicesPage from './pages/InvoicesPage'
import MaintenancePage from './pages/MaintenancePage'

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
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
