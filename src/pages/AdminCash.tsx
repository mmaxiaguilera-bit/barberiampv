import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PanelLayout } from "@/components/PanelLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Database } from "@/integrations/supabase/types";
import { Barber, formatPrice, formatTime, toISODate } from "@/lib/booking";
import {
  PAYMENT_METHODS, EXPENSE_CATEGORIES, paymentMethodLabel, paymentMethodIcon,
  expenseCategoryLabel, PaymentMethod, ExpenseCategory
} from "@/lib/cash";
import {
  CalendarIcon, ChevronLeft, ChevronRight, Loader2, Plus, Lock, Unlock,
  TrendingUp, TrendingDown, Wallet, Printer, Trash2, DollarSign, Receipt
} from "lucide-react";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Payment = Database["public"]["Tables"]["payments"]["Row"] & { barbers?: { name: string } | null };
type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type Closure = Database["public"]["Tables"]["cash_closures"]["Row"];

const AdminCash = () => {
  const { user } = useAuth();
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [barberFilter, setBarberFilter] = useState("all");
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [closure, setClosure] = useState<Closure | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  useEffect(() => {
    supabase.from("barbers").select("*").order("display_order")
      .then(({ data }) => setBarbers(data ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const iso = toISODate(date);
    let pq = supabase.from("payments").select("*, barbers(name)").eq("payment_date", iso).order("paid_at");
    if (barberFilter !== "all") pq = pq.eq("barber_id", barberFilter);
    const [{ data: p }, { data: e }, { data: c }] = await Promise.all([
      pq,
      supabase.from("expenses").select("*").eq("expense_date", iso).order("created_at"),
      supabase.from("cash_closures").select("*").eq("closure_date", iso).maybeSingle(),
    ]);
    setPayments((p ?? []) as Payment[]);
    setExpenses((e ?? []) as Expense[]);
    setClosure((c ?? null) as Closure | null);
    setLoading(false);
  }, [date, barberFilter]);

  useEffect(() => { load(); }, [load]);

  const navigate = (delta: number) => { const d = new Date(date); d.setDate(d.getDate() + delta); setDate(d); };

  const totals = useMemo(() => {
    const totalIncome = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalTips = payments.reduce((s, p) => s + Number(p.tip), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const incomeByMethod: Record<string, number> = {};
    PAYMENT_METHODS.forEach(m => { incomeByMethod[m] = 0; });
    payments.forEach(p => { incomeByMethod[p.payment_method] += Number(p.amount) + Number(p.tip); });
    const ticketAvg = payments.length ? totalIncome / payments.length : 0;
    const totalCash = totalIncome + totalTips - totalExpenses;
    return { totalIncome, totalTips, totalExpenses, incomeByMethod, ticketAvg, totalCash };
  }, [payments, expenses]);

  const isClosed = !!closure;
  const isToday = toISODate(date) === toISODate(new Date());

  const closeCash = async (notes: string) => {
    if (!user) return;
    const { error } = await supabase.from("cash_closures").insert({
      closure_date: toISODate(date),
      total_income: totals.totalIncome,
      total_tips: totals.totalTips,
      total_expenses: totals.totalExpenses,
      total_cash: totals.totalCash,
      income_by_method: totals.incomeByMethod,
      appointments_count: payments.length,
      notes: notes.trim() || null,
      closed_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Caja cerrada");
    setCloseOpen(false);
    load();
  };

  const reopenCash = async () => {
    if (!closure || !confirm("¿Reabrir la caja de este día?")) return;
    const { error } = await supabase.from("cash_closures").delete().eq("id", closure.id);
    if (error) return toast.error(error.message);
    toast.success("Caja reabierta");
    load();
  };

  const removePayment = async (id: string) => {
    if (!confirm("¿Eliminar este cobro?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cobro eliminado");
    load();
  };

  const removeExpense = async (id: string) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Gasto eliminado");
    load();
  };

  return (
    <PanelLayout requireRole="admin">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Caja
          </h1>
          <p className="text-sm text-muted-foreground capitalize">
            {date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {isClosed && <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-success"><Lock className="h-3 w-3" /> Cerrada</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm"><CalendarIcon className="h-4 w-4" /> Fecha</Button></PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={date} onSelect={d => d && setDate(d)} locale={es} className="pointer-events-auto p-3" />
            </PopoverContent>
          </Popover>
          <Select value={barberFilter} onValueChange={setBarberFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los barberos</SelectItem>
              {barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDate(d); }}>Hoy</Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> PDF</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Stat icon={TrendingUp} label="Ingresos" value={formatPrice(totals.totalIncome)} color="text-success" />
            <Stat icon={DollarSign} label="Propinas" value={formatPrice(totals.totalTips)} color="text-primary" />
            <Stat icon={TrendingDown} label="Gastos" value={formatPrice(totals.totalExpenses)} color="text-destructive" />
            <Stat icon={Wallet} label="En caja" value={formatPrice(totals.totalCash)} color="text-info" highlight />
          </div>

          {/* Income by method */}
          <div className="luxury-card p-4 mb-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Por método de pago</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PAYMENT_METHODS.map(m => (
                <div key={m} className="p-3 rounded-md bg-secondary/30 border border-border">
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{paymentMethodIcon(m)}</span> {paymentMethodLabel(m)}
                  </div>
                  <div className="font-serif text-lg mt-0.5">{formatPrice(totals.incomeByMethod[m])}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {payments.length} cobros · ticket promedio {formatPrice(totals.ticketAvg)}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            {/* Payments list */}
            <div className="luxury-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-lg flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Cobros</h3>
                {!isClosed && (
                  <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
                    <DialogTrigger asChild><Button size="sm" variant="goldOutline"><Plus className="h-3.5 w-3.5" /> Walk-in</Button></DialogTrigger>
                    <WalkInPaymentDialog date={date} barbers={barbers} onClose={() => { setPaymentOpen(false); load(); }} />
                  </Dialog>
                )}
              </div>
              {payments.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Sin cobros registrados</p>
              ) : (
                <div className="space-y-2">
                  {payments.map(p => (
                    <div key={p.id} className="p-3 rounded-md bg-secondary/30 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{paymentMethodIcon(p.payment_method)}</span>
                            <span>{paymentMethodLabel(p.payment_method)}</span>
                            <span>·</span>
                            <span>{new Date(p.paid_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <div className="text-sm font-medium truncate">{p.client_name || "Cliente"} — {p.service_name}</div>
                          <div className="text-xs text-muted-foreground">{p.barbers?.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-serif text-primary">{formatPrice(Number(p.amount))}</div>
                          {Number(p.tip) > 0 && <div className="text-[10px] text-muted-foreground">+ {formatPrice(Number(p.tip))} prop.</div>}
                        </div>
                        {!isClosed && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 print:hidden" onClick={() => removePayment(p.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expenses list */}
            <div className="luxury-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-lg flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Gastos</h3>
                {!isClosed && (
                  <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
                    <DialogTrigger asChild><Button size="sm" variant="goldOutline"><Plus className="h-3.5 w-3.5" /> Gasto</Button></DialogTrigger>
                    <ExpenseDialog date={date} userId={user?.id ?? null} onClose={() => { setExpenseOpen(false); load(); }} />
                  </Dialog>
                )}
              </div>
              {expenses.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">Sin gastos registrados</p>
              ) : (
                <div className="space-y-2">
                  {expenses.map(e => (
                    <div key={e.id} className="p-3 rounded-md bg-secondary/30 border border-border flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">{expenseCategoryLabel(e.category)}</div>
                        <div className="text-sm">{e.description}</div>
                      </div>
                      <div className="font-serif text-destructive">{formatPrice(Number(e.amount))}</div>
                      {!isClosed && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 print:hidden" onClick={() => removeExpense(e.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Closure block */}
          <div className="luxury-card p-5 print:hidden">
            {isClosed ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-success font-serif text-lg">
                    <Lock className="h-4 w-4" /> Caja cerrada
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Total: {formatPrice(Number(closure!.total_cash))} · Cerrada el {new Date(closure!.closed_at).toLocaleString("es-AR")}
                  </p>
                  {closure!.notes && <p className="text-xs mt-1 italic">"{closure!.notes}"</p>}
                </div>
                <Button variant="outline" size="sm" onClick={reopenCash}><Unlock className="h-3.5 w-3.5" /> Reabrir</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-serif text-lg">Cerrar caja del día</div>
                  <p className="text-xs text-muted-foreground">Total a cerrar: {formatPrice(totals.totalCash)} ({payments.length} cobros, {expenses.length} gastos)</p>
                </div>
                <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
                  <DialogTrigger asChild>
                    <Button variant="gold" size="sm" disabled={payments.length === 0 && expenses.length === 0}>
                      <Lock className="h-4 w-4" /> Cerrar caja
                    </Button>
                  </DialogTrigger>
                  <CloseCashDialog totals={totals} count={payments.length} onConfirm={closeCash} />
                </Dialog>
              </div>
            )}
          </div>
        </>
      )}
    </PanelLayout>
  );
};

const Stat = ({ icon: Icon, label, value, color, highlight }: any) => (
  <div className={cn("luxury-card p-4", highlight && "border-primary/40")}>
    <Icon className={`h-5 w-5 ${color} mb-2`} />
    <div className="font-serif text-xl">{value}</div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
  </div>
);

// ----- Walk-in dialog -----
const WalkInPaymentDialog = ({ date, barbers, onClose }: { date: Date; barbers: Barber[]; onClose: () => void }) => {
  const { user } = useAuth();
  const [barberId, setBarberId] = useState(barbers[0]?.id ?? "");
  const [serviceName, setServiceName] = useState("");
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!barberId || !serviceName.trim() || !amount) return toast.error("Completá los campos");
    const amt = Number(amount), tp = Number(tip);
    if (!Number.isFinite(amt) || amt < 0) return toast.error("Monto inválido");
    setBusy(true);
    const { error } = await supabase.from("payments").insert({
      barber_id: barberId,
      service_name: serviceName.trim(),
      client_name: clientName.trim() || null,
      amount: amt, tip: tp || 0,
      payment_method: method,
      payment_date: toISODate(date),
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cobro registrado");
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle className="font-serif text-2xl">Cobro walk-in</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Barbero</Label>
          <Select value={barberId} onValueChange={setBarberId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{barbers.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Servicio</Label><Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Corte" /></div>
          <div><Label>Cliente (opcional)</Label><Input value={clientName} onChange={e => setClientName(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Monto</Label><Input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>Propina</Label><Input type="number" min={0} step="0.01" value={tip} onChange={e => setTip(e.target.value)} /></div>
        </div>
        <div>
          <Label>Método</Label>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {PAYMENT_METHODS.map(m => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className={cn("py-2 rounded-md text-xs border", method === m ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/30 border-border")}>
                {paymentMethodIcon(m)} {paymentMethodLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
        </Button>
      </div>
    </DialogContent>
  );
};

// ----- Expense dialog -----
const ExpenseDialog = ({ date, userId, onClose }: { date: Date; userId: string | null; onClose: () => void }) => {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("otros");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!description.trim() || !amount) return toast.error("Completá los campos");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Monto inválido");
    setBusy(true);
    const { error } = await supabase.from("expenses").insert({
      expense_date: toISODate(date),
      amount: amt,
      description: description.trim(),
      category,
      created_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Gasto registrado");
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle className="font-serif text-2xl">Nuevo gasto</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Categoría</Label>
          <Select value={category} onValueChange={v => setCategory(v as ExpenseCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{expenseCategoryLabel(c)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Descripción</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. Cera fijadora" /></div>
        <div><Label>Monto</Label><Input type="number" min={0.01} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <Button variant="gold" className="w-full" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar gasto"}
        </Button>
      </div>
    </DialogContent>
  );
};

// ----- Close cash dialog -----
const CloseCashDialog = ({ totals, count, onConfirm }: { totals: any; count: number; onConfirm: (notes: string) => void }) => {
  const [notes, setNotes] = useState("");
  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle className="font-serif text-2xl flex items-center gap-2"><Lock className="h-5 w-5 text-primary" /> Cerrar caja</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-3 rounded bg-secondary/30 border border-border">
            <div className="text-xs text-muted-foreground">Ingresos</div>
            <div className="font-serif text-lg text-success">{formatPrice(totals.totalIncome)}</div>
          </div>
          <div className="p-3 rounded bg-secondary/30 border border-border">
            <div className="text-xs text-muted-foreground">Propinas</div>
            <div className="font-serif text-lg">{formatPrice(totals.totalTips)}</div>
          </div>
          <div className="p-3 rounded bg-secondary/30 border border-border">
            <div className="text-xs text-muted-foreground">Gastos</div>
            <div className="font-serif text-lg text-destructive">{formatPrice(totals.totalExpenses)}</div>
          </div>
          <div className="p-3 rounded bg-primary/10 border border-primary/40">
            <div className="text-xs text-muted-foreground">En caja</div>
            <div className="font-serif text-lg text-primary">{formatPrice(totals.totalCash)}</div>
          </div>
        </div>
        <div><Label>Observaciones (opcional)</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
        <p className="text-xs text-muted-foreground">Se registrarán {count} cobros. Después de cerrar, los cobros y gastos del día quedan bloqueados (podés reabrir si necesitás).</p>
        <Button variant="gold" className="w-full" onClick={() => onConfirm(notes)}>Confirmar cierre</Button>
      </div>
    </DialogContent>
  );
};

export default AdminCash;
