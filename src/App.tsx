import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import MyAppointment from "./pages/MyAppointment.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.tsx";
import TermsOfUse from "./pages/TermsOfUse.tsx";
import NotFound from "./pages/NotFound.tsx";

const Auth = lazy(() => import("./pages/Auth.tsx"));
const BarberPanel = lazy(() => import("./pages/BarberPanel.tsx"));
const AdminOverview = lazy(() => import("./pages/AdminOverview.tsx"));
const AdminAppointments = lazy(() => import("./pages/AdminAppointments.tsx"));
const AdminBarbers = lazy(() => import("./pages/AdminBarbers.tsx"));
const AdminUsers = lazy(() => import("./pages/AdminUsers.tsx"));
const AdminServices = lazy(() => import("./pages/AdminServices.tsx"));
const AdminSchedules = lazy(() => import("./pages/AdminSchedules.tsx"));
const AdminCash = lazy(() => import("./pages/AdminCash.tsx"));
const AdminReports = lazy(() => import("./pages/AdminReports.tsx"));
const AdminClients = lazy(() => import("./pages/AdminClients.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={null}>
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
            <Route path="/privacidad" element={<PrivacyPolicy />} />
            <Route path="/terminos" element={<TermsOfUse />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
