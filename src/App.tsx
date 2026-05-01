import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import BarberPanel from "./pages/BarberPanel.tsx";
import AdminOverview from "./pages/AdminOverview.tsx";
import AdminAppointments from "./pages/AdminAppointments.tsx";
import AdminBarbers from "./pages/AdminBarbers.tsx";
import AdminUsers from "./pages/AdminUsers.tsx";
import AdminServices from "./pages/AdminServices.tsx";
import AdminSchedules from "./pages/AdminSchedules.tsx";
import AdminCash from "./pages/AdminCash.tsx";
import AdminReports from "./pages/AdminReports.tsx";
import AdminClients from "./pages/AdminClients.tsx";
import MyAppointment from "./pages/MyAppointment.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/panel" element={<BarberPanel />} />
            <Route path="/admin" element={<AdminOverview />} />
            <Route path="/admin/turnos" element={<AdminAppointments />} />
            <Route path="/admin/barberos" element={<AdminBarbers />} />
            <Route path="/admin/servicios" element={<AdminServices />} />
            <Route path="/admin/horarios" element={<AdminSchedules />} />
            <Route path="/admin/caja" element={<AdminCash />} />
            <Route path="/admin/reportes" element={<AdminReports />} />
            <Route path="/admin/usuarios" element={<AdminUsers />} />
            <Route path="/admin/clientes" element={<AdminClients />} />
            <Route path="/mi-turno" element={<MyAppointment />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
