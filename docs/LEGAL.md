# Cumplimiento legal — MVP Barber

Revisión del 22/10/2026 sobre la rama local `feat/fidelizacion` (sin commit ni push). Probado solo contra `mvp-barber-dev`.
**No es asesoramiento legal ni garantía de cumplimiento:** los textos se basan en el funcionamiento real del sitio y en las normas citadas abajo, y los puntos marcados ⚖️ necesitan revisión de un abogado local antes de publicar.

## Contexto confirmado

- Barbería presencial en Av. Francisco Seguí 1157, Rada Tilly, Chubut. Atiende solo en Argentina, a consumidores finales.
- Servicios: corte, barba y diseños. La web reserva turnos, no cobra y no vende. En el local se venden bebidas (venta presencial).
- Pagos solo en el local: efectivo, tarjeta, Mercado Pago y otros medios. No se cobra seña.
- Supabase de producción (`egqaiatuiqmzmuqogrcx`) en el este de EE.UU.
- Acceden a los datos: el dueño, los barberos y Maxi (soporte).
- No hay Google Analytics, Meta Pixel ni formularios externos. WhatsApp: solo se guarda el número; no se envían mensajes.

## Qué cambió

| Área | Cambio | Archivos |
|---|---|---|
| Analítica | Se quitó el script de ejemplo de Google Analytics (cargaba `gtag.js` sin ID real ni consentimiento) | `index.html` |
| Terceros | Tipografías Inter y Playfair Display servidas desde el sitio (`@fontsource`, licencia SIL OFL 1.1) en vez de Google Fonts | `src/main.tsx`, `src/index.css`, `package.json` |
| Terceros | El mapa de Google se carga solo al tocar "Ver mapa aquí"; también hay un link a Google Maps | `src/pages/Index.tsx` |
| Documentos | Términos (v `terminos-v2-2026-10`), Privacidad (v `privacidad-v2-2026-10`) y nueva página `/cookies` | `src/pages/TermsOfUse.tsx`, `PrivacyPolicy.tsx`, `CookiesPolicy.tsx`, `src/components/LegalPage.tsx`, `src/lib/legal.ts` |
| Reserva | Casilla obligatoria y desmarcada de condiciones, aviso de privacidad sin casilla, versión guardada en el turno | `src/components/BookingDialog.tsx` |
| Reserva | Se quitó la fecha de nacimiento (no hace falta para un turno) | ídem |
| Reserva | Escribir un teléfono ya no muestra nombre, apellido, email ni nacimiento de esa ficha | ídem + migración |
| Tarjeta | Casilla obligatoria de condiciones, separada de las dos casillas de promociones (email y WhatsApp), que siguen opcionales | `LoyaltyAccessForm.tsx`, `LoyaltyCard.tsx` |
| Tarjeta | WhatsApp opcional; solo es obligatorio para aceptar mensajes por WhatsApp | ídem + migración |
| Tarjeta | Los datos del alta guardados en el navegador se borran solos a las 24 h | `src/lib/loyalty.ts` |
| Cancelación | La regla "hasta 3 h antes" ahora la valida también el servidor (antes solo la pantalla) | migración |
| Base | Tabla `legal_document_versions`, columnas de aceptación en `appointments` y `loyalty_accounts` | `supabase/migrations/20261022150000_legal_compliance.sql` |

### Diferencias que había entre lo publicado y el sistema

- Los Términos decían "aviso mínimo de 2 horas" comunicándose con el local. `/mi-turno` permitía cancelar online hasta **3 h** antes, pero el servidor no lo controlaba. Ahora el texto dice 3 h y el servidor lo exige.
- Los Términos decían que se podía reprogramar. En la web no existe esa función: el texto ahora dice que se cancela y se reserva otro turno, o se le pide el cambio a la barbería.
- Se quitó la cláusula de "suspensión del acceso por ausencias", que no estaba confirmada.
- La Política decía que no se usa rastreo, pero `index.html` cargaba Google Analytics y el mapa de Google se cargaba siempre.
- La Política decía que la fecha de nacimiento servía "para reconocerte como cliente frecuente". No hace falta para eso: se quitó del formulario de reserva.
- Se quitó la jurisdicción exclusiva de Chubut, porque en una relación de consumo puede limitar los derechos del cliente (art. 37, Ley 24.240).

## Cómo funcionan los consentimientos y sus registros

Cada aceptación tiene su propio mecanismo:

| Qué | Cómo se pide | Dónde queda la prueba |
|---|---|---|
| Condiciones de reserva | Casilla obligatoria y desmarcada. Sin marcarla, "Confirmar turno" queda deshabilitado | `appointments.terms_version`, `privacy_notice_version` y `created_at`, más el id del turno y el teléfono |
| Aviso de privacidad (reserva y tarjeta) | Texto informativo con link, **sin casilla**. El tratamiento para gestionar el turno no necesita consentimiento (art. 5, inc. 2, ap. d, Ley 25.326) | Se guarda qué versión se mostró (`privacy_notice_version`) |
| Condiciones de la tarjeta | Casilla obligatoria y desmarcada, separada de las promociones | `loyalty_accounts.terms_version`, `privacy_notice_version` y `terms_accepted_at`; además `loyalty_events` (`client_registered`, con usuario) |
| Promociones por email | Casilla opcional y desmarcada | `marketing_consents` (ya existía): canal, alta o baja, versión, texto exacto en `marketing_consent_texts`, fecha, origen (`signup`, `customer_panel`, `unsubscribe_link`, staff) y usuario |
| Promociones por WhatsApp | Casilla opcional y desmarcada, independiente de la de email | ídem, con `channel = 'whatsapp'` |

- **No se duplicó** el registro de marketing: `marketing_consents` ya cumplía (historial que no se edita, versión y texto, origen, actor, baja por link). Las aceptaciones de condiciones siguen el mismo patrón con `legal_document_versions`.
- **Integridad:** las versiones son claves foráneas (no se puede guardar una versión inventada). La política de inserción exige las dos versiones en toda reserva web. Un trigger impide que nadie, ni el admin, borre o cambie la aceptación de un turno.
- **Datos mínimos:** no se guardan IP, navegador ni huella del dispositivo. La prueba se compone de la versión, la fecha y hora del servidor, el origen y el identificador del turno o la ficha.
- **Turnos cargados por el personal:** quedan con las versiones en `NULL`, porque no son una aceptación del cliente.
- **Acceso:** el admin y los barberos leen `appointments` según las políticas que ya existían. Cada cliente ve sus propios consentimientos en `/mi-tarjeta`.
- **Cómo recuperar la prueba de una reserva** (solo admin, en el SQL editor):
  ```sql
  SELECT a.id, a.created_at, a.client_phone, a.terms_version, a.privacy_notice_version, l.published_on, l.summary
  FROM appointments a JOIN legal_document_versions l ON l.version = a.terms_version
  WHERE a.client_phone = '<teléfono>';
  ```
- **Cambiar un texto legal:**
  1. Crear una migración que inserte la nueva versión en `legal_document_versions`.
  2. Actualizar `TERMS_VERSION`, `PRIVACY_VERSION` y `LEGAL_UPDATED_AT` en `src/lib/legal.ts`.
  3. Si cambia un texto de marketing, crear una versión nueva en `marketing_consent_texts`, nunca editar la existente.

## Conservación propuesta (pendiente de aprobación)

Los plazos ya figuran en la Política (sección 5) como propuesta. **Hay que aprobarlos antes de publicar.** La eliminación automática **no está implementada** hasta acordar el criterio.

| Finalidad | Plazo propuesto | Fundamento |
|---|---|---|
| Datos de reservas (ficha sin tarjeta, turnos) | 2 años desde el último turno; después eliminar o anonimizar (dejar solo estadística) | Art. 4 inc. 7, Ley 25.326 (destruir cuando dejan de ser necesarios). Alcanza para reconocer clientes habituales y atender reclamos |
| Cobros y caja | Lo que exijan las normas fiscales y contables | Confirmar con el contador del dueño |
| Tarjeta de fidelidad | Mientras esté activa; baja a los 2 años sin visitas (avisando antes) | Una tarjeta sin uso pierde su finalidad |
| Promociones (email/WhatsApp) | Hasta la baja; además, dejar de enviar a quien lleve 2 años sin visitas | Consentimiento revocable (art. 27, Ley 25.326) |
| Registro de aceptaciones y bajas | Mientras dure el tratamiento + 3 años | Poder acreditar el consentimiento ante un reclamo. Prescripción de sanciones de la Ley 24.240 (art. 50) ⚖️ |

## Minimización de datos (formulario por formulario)

**Reserva**

| Campo | ¿Queda? | Por qué |
|---|---|---|
| Teléfono | Sí, obligatorio | Contactar por el turno e identificar en `/mi-turno` |
| Nombre y apellido | Sí, obligatorio | Identificar al cliente en el local. El apellido distingue homónimos en la agenda |
| Email | Sí, opcional | Solo para mandar la confirmación |
| Fecha de nacimiento | **Eliminado** | No hace falta para un turno. El cumpleaños, si se usa, se pide en la tarjeta (día y mes, opcional) |

**Tarjeta de fidelidad**

| Campo | ¿Queda? | Por qué |
|---|---|---|
| Nombre | Sí, obligatorio | Mostrar la tarjeta y reconocer al cliente |
| Email | Sí, obligatorio | Es el inicio de sesión: recibe el código y se verifica |
| WhatsApp | Ahora **opcional** | Antes era obligatorio, pero hoy no se envían mensajes. Solo se exige si marca la casilla de WhatsApp |
| Cumpleaños (día y mes, sin año) | Opcional | Beneficio o saludo de cumpleaños. Para enviar el saludo hace falta el consentimiento de promociones |

**Atención sin turno** (personal, `ClientPicker`): pide nombre y, opcionalmente, teléfono y email. No se cambió.

## Accesos por rol (hallazgos, sin cambios)

Estos puntos cambian lo que ve cada persona del equipo, así que se dejan como decisión:

- **Barberos:** pueden leer todas las fichas de `clients` (email, WhatsApp, cumpleaños) y todos los `marketing_consents`. También entran a `/admin/clientes`. Para atender les alcanza con nombre y teléfono de sus turnos, más la búsqueda para registrar visitas.
  - **Propuesta:** consentimientos y cumpleaños solo para el admin, y búsqueda de barberos mediante una función que devuelva nombre y teléfono.
- **Soporte (Maxi):** usar una cuenta propia, no la del dueño, y firmar con el dueño un acuerdo de prestación de servicios de tratamiento con confidencialidad (art. 25, Ley 25.326) ⚖️.
- **`/mi-turno`:** quien sepa un teléfono ve y cancela los próximos turnos de esa persona. Esto ya existía; se recomienda un link con token en el email de confirmación o un código.
- **`send-confirmation-email`:** permite enviar emails a cualquier dirección con contenido arbitrario. Esto ya existía; se recomienda generar el email en el servidor a partir del id del turno.

## Proveedores y servicios

| Proveedor | Uso | Estado |
|---|---|---|
| Supabase Inc. (EE.UU. este) | Base de datos, inicio de sesión, almacenamiento de fotos, Edge Functions | Confirmado |
| SMTP de los emails de turnos | `send-confirmation-email` y `send-cancellation-email` usan `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` (secretos de Supabase) y envían desde `Barbería MVP <SMTP_USER>` | **Pendiente:** el código no revela el proveedor. Ver en Supabase → Edge Functions → Secrets solo el valor de `SMTP_HOST`, sin compartir la contraseña |
| Emails de inicio de sesión (código de la tarjeta) | Supabase Auth: el SMTP integrado, salvo que se configure uno propio | Confirmar en Auth → SMTP Settings |
| Easypanel (deploy de la web) | Sirve el frontend | **Pendiente:** ubicación del servidor. Si está fuera de Argentina, sumarlo a la transferencia internacional |
| Google | Solo si el visitante toca "Ver mapa aquí" | Informado en `/cookies` |

## Imágenes, logo y tipografías

**No se da por válida ninguna licencia sin evidencia.**

| Archivo | Uso | Evidencia encontrada | Qué pedir o hacer |
|---|---|---|---|
| `public/mvp-preview.png` | Vista previa en WhatsApp y redes (`og:image`) | Tiene credenciales de contenido **C2PA**: `digitalSourceType = trainedAlgorithmicMedia`, agente `gpt-image`, firmado por OpenAI, creado el 2026-05-03. **Es una imagen generada con IA**, no una foto de Instagram | ¿Quién la generó y con qué cuenta? Los términos de OpenAI asignan el resultado a quien lo genera, pero no garantizan que tenga derechos de autor. Reproduce el logo, así que también depende de los derechos sobre el logo |
| `src/assets/mvp-logo.png` = `public/favicon.png` (mismo archivo) | Logo y favicon | Sin metadatos. Lo subió el bot de Lovable (`gpt-engineer-app[bot]`) el 2026-04-26 | Archivo original del logo y nombre del diseñador. Cesión o autorización por escrito para uso comercial. Verificar si la marca está registrada o solicitada en el INPI ⚖️ |
| `src/assets/hero-barbershop.jpg` | Foto principal de la portada | Sin metadatos (se borraron). La subió el bot de Lovable el 2026-04-26. Muestra un local genérico de estilo IA | Si no es el local real: **reemplazarla** por fotos reales (puede inducir a error sobre el lugar) tomadas por el dueño o un fotógrafo con cesión escrita. Si es real: archivo original y autor |
| Fotos de cortes en `/barberos/<slug>` | Galería de cada barbero | Las sube cada barbero. **Si se ve la cara de un cliente, hace falta su consentimiento para publicarla** (art. 53, Código Civil y Comercial) | Formulario de autorización de imagen para clientes. Consentimiento de cada barbero para su propia foto ⚖️ |
| `public/placeholder.svg` | Plantilla de Lovable, no se usa en las páginas | — | Se puede borrar |
| Inter, Playfair Display | Tipografías | Licencia **SIL OFL 1.1** incluida en `node_modules/@fontsource/*/LICENSE` (uso comercial permitido) | Ninguna |

## Normativa consultada (fuentes oficiales)

- **Ley 25.326 de Protección de Datos Personales:** arts. 4, 5 (y 5.2.d), 6, 12, 14, 16, 21, 25 y 27. https://servicios.infoleg.gob.ar/infolegInternet/anexos/60000-64999/64790/norma.htm
- **Decreto 1558/2001**, reglamentario. Su art. 12 dice que la prohibición de transferir no rige si el titular consintió expresamente. https://www.argentina.gob.ar/normativa/nacional/70368/texto
- **Disposición DNPDP 60-E/2016:** cláusulas tipo y lista de países adecuados. EE.UU. no figura. https://www.argentina.gob.ar/normativa/nacional/267922/texto · Res. AAIP 34/2019 (suma al Reino Unido): https://www.boletinoficial.gob.ar/detalleAviso/primera/202373/20190226
- **Resolución AAIP 198/2023:** cláusulas contractuales modelo de la RIPD. https://www.argentina.gob.ar/node/428335
- **Resolución AAIP 14/2018:** deroga la Disp. 10/2008 y exige informar el art. 6 y la leyenda de la AAIP, que se incluye textual en la Política. https://www.boletinoficial.gob.ar/detalleAviso/primera/179914/20180309
- **Disposición DNPDP 4/2009:** publicidad directa. Aviso de retiro o bloqueo en cada envío y "publicidad" en el asunto si no fue solicitada. https://www.argentina.gob.ar/normativa/nacional/norma-151221/texto
- **Ley 26.951, Registro "No Llame":** su art. 4 incluye "servicios similares" que permita la tecnología. https://www.argentina.gob.ar/normativa/nacional/norma-233066/texto
- **Código Civil y Comercial:**
  - Arts. 1105–1116: contratos a distancia y revocación en 10 días, irrenunciable.
  - Art. 53: derecho a la imagen.
  - https://servicios.infoleg.gob.ar/infolegInternet/anexos/235000-239999/235975/norma.htm
- **Ley 24.240 de Defensa del Consumidor:** arts. 4, 34, 37 y 50. https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm
- **Res. SCI 424/2020, "Botón de arrepentimiento":** **derogada** por la Disp. SSDCyLC 954/2025 (B.O. 04/09/2025), que mantiene el botón de arrepentimiento, suma el "botón de baja" y exige publicar un canal de consultas y reclamos. Texto de la 424 (histórico): https://www.argentina.gob.ar/normativa/nacional/norma-342869/texto
  - No encontré el texto de la 954/2025 en argentina.gob.ar. Lo resumido sale de estudios jurídicos, por ejemplo https://allende.com/administrativo/el-gobierno-refuerza-la-proteccion-al-consumidor-en-el-comercio-electronico-09-05-2025/. **Verificar en el Boletín Oficial** (DI-2025-954-APN-SSDCYLC#MEC) ⚖️
- **Res. SCI 274/2021**, link obligatorio a la Ventanilla Única Federal: **derogada** por la Disp. 890/2025 (B.O. 19/08/2025). Ya no hay que mostrar ese link. https://www.argentina.gob.ar/normativa/nacional/norma-416600/texto

## Pendientes

### Decisiones del dueño

1. **Nombre completo del titular** del CUIT 20-46981513-8, para identificar al responsable en la Política (art. 6, Ley 25.326). Hoy figura solo "MVP Barber" y el CUIT.
2. **Plazos de conservación:** aprobar o ajustar la tabla de arriba antes de publicar. Después, implementar la eliminación o anonimización automática.
3. **Inasistencias:** ¿quiere alguna regla? Hoy los Términos solo piden cancelar; no hay penalidades.
4. **Disconformidad con un servicio:** cómo la resuelve. Hoy el texto solo ofrece canal de reclamo, sin promesas.
5. **Reglas reales de la tarjeta** (siguen en DEMO: 10 visitas) y si habrá beneficio de cumpleaños.
6. **Accesos de barberos** a email, cumpleaños y consentimientos de los clientes (ver "Accesos por rol").
7. **Imágenes:** entregar la evidencia de la tabla o aprobar los reemplazos (hero con fotos reales; logo con cesión del diseñador).
8. **Precios:** confirmar que el precio que muestra la web es el precio final que se cobra.
9. **Proveedor de email** (`SMTP_HOST`) y ubicación del servidor de Easypanel.

### Revisión de abogado ⚖️

1. **Transferencia a EE.UU. (Supabase):**
   - Firmar el DPA de Supabase y adoptar cláusulas modelo (Res. AAIP 198/2023 o Disp. 60-E/2016).
   - Pedir consentimiento expreso como condición para reservar no sería libre.
   - La Política hoy solo informa que la transferencia existe y que debe hacerse con garantías; **no afirma que ya estén firmadas**.
2. **Inscripción de la base en el Registro Nacional de Bases de Datos** (art. 21, Ley 25.326).
3. **Disp. 954/2025:** si una reserva gratuita obliga a mostrar el "botón de arrepentimiento" o el "botón de baja".
   - Hoy los Términos informan el derecho de revocación (art. 1110 CCyC) y cómo ejercerlo, pero no hay un botón con ese nombre.
   - Si corresponde, se puede hacer como link destacado a una cancelación sin el límite de 3 h que devuelva un código.
4. **Plazos de conservación:** sobre todo cobros, por las obligaciones fiscales, y registro de consentimientos.
5. **Derecho a la imagen:** fotos de clientes en la galería de barberos y modelo de autorización.
6. **WhatsApp a futuro:**
   - Revisar el Registro "No Llame" (Ley 26.951).
   - Separar "avisos de mi tarjeta" (operativos) de "promociones" en el texto de consentimiento. Hoy van en una sola casilla (`wa-v1-2026-10`).
   - Usar la API oficial con plantillas aprobadas.
7. **Emails promocionales** (cuando existan): leyenda de la Disp. 4/2009 y link de baja en cada envío. El link de baja ya existe (`/baja?token=`).
8. **Menores de edad:** cómo tratar reservas y tarjetas de menores.
9. **Data Fiscal (F. 960/D de ARCA) en la web:** consultar con el contador si corresponde a un sitio que no vende.
10. **Logo:** registro de marca en el INPI.

## Comprobaciones realizadas

- **Base de pruebas:** `npm run db:test:dev` da 86/86 PASS. Hay 16 pruebas nuevas:
  - Reserva sin aceptación rechazada.
  - Versión inventada rechazada.
  - Prueba recuperable por el admin.
  - Aceptación inmutable (`legal_acceptance_immutable`).
  - El turno se sigue pudiendo confirmar.
  - El personal carga turnos sin casilla.
  - Alta de tarjeta exige condiciones y guarda versión y fecha.
  - Tarjeta sin WhatsApp.
  - WhatsApp exigido solo con la casilla.
  - No se puede borrar el WhatsApp con la suscripción vigente.
  - La búsqueda por teléfono devuelve solo el id.
  - Cancelación online rechazada con menos de 3 h y aceptada con más.
- **Unitarias:** `npm test` da 32/32, con pruebas nuevas de WhatsApp opcional y del vencimiento de 24 h del alta pendiente.
- **Código:** `tsc --noEmit` sin errores, `eslint` sin errores en los archivos tocados y `npm run build` OK. El bundle no contiene `fonts.googleapis` ni `googletagmanager`.
- **Navegador** (Chrome sin ventana, 390 px, contra `mvp-barber-dev`):
  - Al cargar la portada no hay pedidos a terceros, ni cookies, ni nada en `localStorage`.
  - Google se contacta solo al tocar "Ver mapa aquí".
  - Reserva: sin fecha de nacimiento; casilla desmarcada; "Confirmar" deshabilitado hasta marcarla; reserva completada.
  - `/terminos`, `/privacidad` y `/cookies` se ven sin desborde horizontal.
  - Alta de tarjeta: 3 casillas desmarcadas, WhatsApp "(opcional)" y error claro si no se aceptan las condiciones.

## Antes de producción (requiere autorización explícita)

1. Resolver los puntos ⚖️ de transferencia internacional y conservación, o como mínimo aprobar los textos.
2. Aplicar las migraciones en orden. Esta (`20261022150000_legal_compliance.sql`) va **en la misma ventana que el deploy del frontend**: el frontend nuevo envía las versiones, la base nueva las exige y `get_client_by_phone` cambia lo que devuelve.
3. Ver también "Antes de pasar a producción" en `docs/FIDELIZACION.md`.
