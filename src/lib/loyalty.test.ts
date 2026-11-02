import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loyaltyProgress, isValidBirthday, csvCell, toCsv, loyaltyErrorMessage, authErrorMessage,
  latestConsent, formatBirthday, normalizeWhatsapp, isValidWhatsapp, whatsappError,
  savePendingSignup, readPendingSignup, PENDING_SIGNUP_TTL_MS, isMinor,
} from "./loyalty";

describe("loyaltyProgress", () => {
  it("calcula sellos y faltantes en un ciclo normal", () => {
    expect(loyaltyProgress(7, 10)).toEqual({ stamps: 7, remaining: 3, percent: 70, owed: 0 });
  });

  it("ciclo recién completado arranca en cero", () => {
    expect(loyaltyProgress(0, 10)).toEqual({ stamps: 0, remaining: 10, percent: 0, owed: 0 });
  });

  it("ciclo negativo (premio canjeado y visita revertida) muestra visitas a compensar", () => {
    expect(loyaltyProgress(-1, 10)).toEqual({ stamps: 0, remaining: 11, percent: 0, owed: 1 });
  });

  it("si bajaron la regla y el ciclo la supera, falta una visita para generar el premio", () => {
    expect(loyaltyProgress(9, 5)).toEqual({ stamps: 5, remaining: 1, percent: 100, owed: 0 });
  });
});

describe("isValidBirthday", () => {
  it("acepta vacío (es opcional)", () => {
    expect(isValidBirthday(null, null)).toBe(true);
  });
  it("exige día y mes juntos", () => {
    expect(isValidBirthday(5, null)).toBe(false);
    expect(isValidBirthday(null, 5)).toBe(false);
  });
  it("acepta 29 de febrero y rechaza 30/02 y 31/04", () => {
    expect(isValidBirthday(29, 2)).toBe(true);
    expect(isValidBirthday(30, 2)).toBe(false);
    expect(isValidBirthday(31, 4)).toBe(false);
    expect(isValidBirthday(31, 12)).toBe(true);
  });
  it("formatea como DD/MM", () => {
    expect(formatBirthday(3, 7)).toBe("03/07");
    expect(formatBirthday(null, null)).toBe("");
  });
});

describe("CSV seguro", () => {
  it("neutraliza fórmulas al inicio de la celda", () => {
    for (const evil of ["=HYPERLINK(\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(evil).startsWith("\"'")).toBe(true);
    }
  });
  it("escapa comillas, comas y saltos de línea", () => {
    expect(csvCell("Pérez, \"Juan\"")).toBe("\"Pérez, \"\"Juan\"\"\"");
    expect(csvCell("a\nb")).toBe("\"a\nb\"");
  });
  it("deja intactos valores normales y vacíos", () => {
    expect(csvCell("sofia@mvp.test")).toBe("\"sofia@mvp.test\"");
    expect(csvCell(null)).toBe("\"\"");
  });
  it("arma encabezado y filas con BOM para Excel", () => {
    const csv = toCsv([{ a: "1", b: "=x" }], [{ key: "a", label: "A" }, { key: "b", label: "B" }]);
    expect(csv).toBe("﻿\"A\",\"B\"\r\n\"1\",\"'=x\"");
  });
});

describe("latestConsent", () => {
  it("toma el último registro por fecha", () => {
    const rows = [
      { granted: true, created_at: "2026-10-01T10:00:00Z" },
      { granted: false, created_at: "2026-10-05T10:00:00Z" },
    ];
    expect(latestConsent(rows)?.granted).toBe(false);
  });
  it("sin registros no está suscripto", () => {
    expect(latestConsent([])).toBeNull();
  });
  it("separa los canales email y WhatsApp", () => {
    const rows = [
      { granted: true, created_at: "2026-10-01T10:00:00Z", channel: "email", seq: 1 },
      { granted: true, created_at: "2026-10-02T10:00:00Z", channel: "whatsapp", seq: 2 },
      { granted: false, created_at: "2026-10-03T10:00:00Z", channel: "whatsapp", seq: 3 },
    ];
    expect(latestConsent(rows, "email")?.granted).toBe(true);
    expect(latestConsent(rows, "whatsapp")?.granted).toBe(false);
  });
  it("con la misma fecha desempata por seq", () => {
    const t = "2026-10-01T10:00:00Z";
    const rows = [{ granted: false, created_at: t, seq: 9 }, { granted: true, created_at: t, seq: 4 }];
    expect(latestConsent(rows)?.granted).toBe(false);
  });
});

describe("mensajes de error", () => {
  it("traduce errores del backend", () => {
    expect(loyaltyErrorMessage({ message: "reward_not_available" })).toMatch(/ya fue canjeado/i);
    expect(loyaltyErrorMessage({ message: "forbidden" })).toMatch(/permiso/i);
    expect(loyaltyErrorMessage({ message: "algo raro" })).toMatch(/algo raro/);
  });
  it("traduce errores de acceso por email", () => {
    expect(authErrorMessage({ message: "Token has expired or is invalid" })).toMatch(/venció|incorrecto/i);
    expect(authErrorMessage({ message: "Signups not allowed for otp" })).toMatch(/no encontramos/i);
    expect(authErrorMessage({ message: "For security purposes, you can only request this after 42 seconds." })).toMatch(/42/);
    expect(authErrorMessage({ message: "Email rate limit exceeded" })).toMatch(/demasiados/i);
    expect(authErrorMessage({ message: "Unable to validate email address: invalid format" })).toMatch(/email no es válido/i);
  });
});

describe("WhatsApp", () => {
  it("normaliza espacios, guiones y paréntesis", () => {
    expect(normalizeWhatsapp(" +54 9 (297) 412-3456 ")).toBe("+5492974123456");
    expect(normalizeWhatsapp("297 412 3456")).toBe("2974123456");
    expect(normalizeWhatsapp("")).toBe("");
  });
  it("exige entre 10 y 15 dígitos", () => {
    expect(isValidWhatsapp("+54 9 297 412 3456")).toBe(true);
    expect(isValidWhatsapp("2974123456")).toBe(true);
    expect(isValidWhatsapp("412 3456")).toBe(false);
    expect(isValidWhatsapp("abc")).toBe(false);
  });
});

describe("whatsappError", () => {
  it("permite dejarlo vacío si no acepta mensajes por WhatsApp", () => {
    expect(whatsappError("", false)).toBeNull();
    expect(whatsappError("   ", false)).toBeNull();
  });
  it("lo exige solo para aceptar mensajes por WhatsApp", () => {
    expect(whatsappError("", true)).toMatch(/ingresá tu número/);
  });
  it("valida el formato cuando se completa", () => {
    expect(whatsappError("123", false)).toMatch(/código de área/);
    expect(whatsappError("+54 9 297 412 3456", true)).toBeNull();
  });
});

describe("datos de alta pendientes", () => {
  // Node 26 deja localStorage sin definir dentro de jsdom: se usa uno en memoria
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });
  });
  const p = {
    email: "a@b.c", first_name: "Ana", whatsapp: "", birth_day: null, birth_month: null,
    marketing_opt_in: false, whatsapp_opt_in: false, accepted_terms: true,
  };
  it("se recuperan mientras se verifica el email", () => {
    savePendingSignup(p);
    expect(readPendingSignup()).toEqual(p);
  });
  it("se borran del navegador pasadas 24 h", () => {
    savePendingSignup(p);
    expect(readPendingSignup(Date.now() + PENDING_SIGNUP_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem("mvp_loyalty_pending_signup")).toBeNull();
  });
});

describe("año de nacimiento y menores", () => {
  it("el año va solo junto con día y mes", () => {
    expect(isValidBirthday(null, null, 1990)).toBe(false);
    expect(isValidBirthday(5, 3, 1990)).toBe(true);
    expect(isValidBirthday(29, 2, 2023)).toBe(false); // 2023 no es bisiesto
    expect(isValidBirthday(29, 2, 2024)).toBe(true);
    expect(isValidBirthday(5, 3, 1850)).toBe(false);
    expect(isValidBirthday(5, 3, 2999)).toBe(false); // futuro
  });
  it("detecta menores de 18 según la fecha de hoy", () => {
    const hoy = new Date(2026, 10, 3); // 3/11/2026
    expect(isMinor(3, 11, 2008, hoy)).toBe(false); // cumple 18 hoy
    expect(isMinor(4, 11, 2008, hoy)).toBe(true);  // cumple 18 mañana
    expect(isMinor(5, 3, 1990, hoy)).toBe(false);
    expect(isMinor(5, 3, null, hoy)).toBe(false);  // sin año no se sabe
  });
});
