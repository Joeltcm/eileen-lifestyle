# El monto mensual del perfil manda en la facturación (v310)

De Claude, 2026-10-15. Pedido de Joel. Base: `main` c5f3235 (v309 publicado). Tú implementas; yo reviso; Joel publica.

## 1. Decisiones de Joel (2026-10-15, vinculantes)

1. **El precio de la factura sale del perfil del cliente** (`clients.standard_price`), nunca del plan del catálogo (`service_plans.price`). Los planes del catálogo son **tarifas de referencia** para cotizar; no determinan lo que se cobra.
2. **El plan del catálogo deja de guardarse en el expediente**. Hoy `clients.plan_id` apunta al plan asignado y la factura usa su precio. A partir de ahora, al elegir un plan solo se **prellena** el `standard_price` y las sesiones en el expediente; `plan_id` pasa a ser `NULL` después de la precarga (o se elimina la columna — ver sección 3).
3. **Agregar el campo "Monto mensual de este cliente"** al formulario "Editar cliente" (expediente). Ese monto es `standard_price` y es lo que la generación automática usa para la factura.
4. **No afectar paquetes ni crédito**: los paquetes se cobran al crear el saldo (su precio vive en `session_packages.amount`); el crédito se calcula por sesión (`credit_session_price`). Este cambio solo toca la generación de **mensualidades anticipadas**.
5. **Planes familiares**: la factura de cada beneficiario ya usa `COALESCE(i.billed_for_client_id, i.client_id)` para identificar a quién cobra. Cada persona del grupo tiene su propio `standard_price`. Eso no cambia. Ejemplo: Riccardo paga la factura consolidada, pero el monto de Ernesto sale de `Ernesto.standard_price`, el de Iraida de `Iraida.standard_price`, y el de Riccardo de `Riccardo.standard_price`.

## 2. Cambios en el backend

### 2.1 Generación de facturas (`generateRecurringInvoices`)

**Antes** (línea 426 de `server.ts`):
```sql
CASE WHEN c.payment_mode = 'no_anticipado' THEN 0
  ELSE COALESCE(p.price, c.standard_price) END AS amount
```

**Después**:
```sql
CASE WHEN c.payment_mode = 'no_anticipado' THEN 0
  ELSE c.standard_price END AS amount
```

Se quita el `LEFT JOIN service_plans p ON p.id = c.plan_id` de este CTE (ya no se necesita para el monto). El `plan_name` para el concepto de la factura se reemplaza por `'Mensualidad'` (o se toma del nombre del plan solo si `plan_id` sigue existiendo — ver sección 3).

Hacer lo mismo en `recurringBillingStatus` (líneas 130, 134): cambiar `COALESCE(p.price, c.standard_price)` por `c.standard_price`, y quitar el JOIN al plan si ya no aporta nada.

### 2.2 Filtro de elegibilidad

**Antes** (línea 437):
```sql
AND COALESCE(p.price, c.standard_price) > 0
```

**Después**:
```sql
AND c.standard_price > 0
```

### 2.3 Renovación de saldos de sesiones (candidatosPendientes, línea 507+)

Las sesiones del saldo ya salen de `COALESCE(c.monthly_session_target, pl.sessions_included, ...)` — eso está bien: la meta de sesiones del perfil manda. El JOIN a `service_plans` aquí solo sirve como fallback de sesiones si no hay `monthly_session_target`. **Dejarlo** como fallback de sesiones, pero **no usarlo para el monto**.

### 2.4 Sugerencias de monto en cobros manuales y cobertura (líneas 3885, 4356)

Cambiar `COALESCE(p.price, c.standard_price, 0)` por `COALESCE(c.standard_price, 0)`. Son sugerencias, no cobros; pero deben coincidir con lo que la generación produciría.

### 2.5 Propagación al editar un plan del catálogo (línea 880)

**Antes**: editar el precio de un plan propagaba a todos los clientes con ese plan: `UPDATE clients SET standard_price = ... WHERE plan_id = ...`.

**Después**: **eliminar** esa propagación. El precio del plan es una referencia; cambiarlo no debe alterar el `standard_price` que Eileen ya pactó con cada cliente. (Si Eileen quiere subir el precio a varios, lo hace uno por uno en cada expediente — es intencional para que no se le cambie sin querer.)

**También eliminar** la propagación a `memberships.amount` en la misma ruta (línea 882-884). La membresía debe tomar el precio del perfil del cliente, no del catálogo.

### 2.6 PATCH /api/clients/:id/plan (asignar plan al cliente)

**Antes** (línea 1151): `standard_price = ${plan.price}` — siempre pisaba el precio con el del catálogo.

**Después**: `standard_price = ${plan.price}` **solo si `standard_price` es 0 o NULL** (es decir, solo prellena si no tiene precio propio):
```sql
standard_price = CASE WHEN standard_price IS NULL OR standard_price = 0
  THEN ${plan.price} ELSE standard_price END
```

Misma lógica para `memberships.amount` (línea 1164): usar `standard_price` del cliente en vez de `plan.price`.

Y para el saldo que se abre al asignar (línea 1189): el monto del saldo es `standard_price`, no `plan.price`.

### 2.7 Concepto de la factura

El concepto hoy dice `plan_name || ' · ' || ...`. Si se quita `plan_id` del cliente, el nombre del plan ya no está disponible. Usar `'Mensualidad'` fijo para mensualidades (o conservar `plan_id` como referencia informativa para el nombre — ver sección 3).

### 2.8 Índice único de facturas automáticas (migración 029)

El índice actual:
```sql
CREATE UNIQUE INDEX invoices_automatic_period_idx
  ON invoices(client_id, billing_period, billed_for_client_id)
  WHERE auto_generated = true;
```

**Problema**: al anular una factura automática (`status = 'void'`), sigue ocupando el índice porque no filtra por status. El `INSERT ... ON CONFLICT DO NOTHING` de la generación la ve y no crea la factura nueva. Anular no permite regenerar.

**Fix (migración v310)**: recrear el índice excluyendo las anuladas:
```sql
DROP INDEX IF EXISTS invoices_automatic_period_idx;
CREATE UNIQUE INDEX invoices_automatic_period_idx
  ON invoices(client_id, billing_period, billed_for_client_id)
  WHERE auto_generated = true AND status <> 'void';
```

Con esto, anular una factura automática libera el espacio en el índice y "Generar cobros pendientes" puede crear una nueva para el mismo periodo. **Reversa**: restaurar el índice anterior (sin filtro de status); no es destructiva.

**Prueba obligatoria adicional**: generar factura automática → anularla → volver a generar → se crea factura nueva con monto correcto, sin conflicto de índice.

## 3. Decisión sobre `clients.plan_id`

**Opción A (recomendada)**: conservar `plan_id` como referencia informativa. No lo usa la facturación; solo dice "este cliente se cotizó con este plan". El concepto de la factura puede seguir diciendo el nombre del plan. No requiere migración destructiva.

**Opción B**: quitar `plan_id` del expediente y migrar a `NULL`. Más limpio pero rompe la trazabilidad y el nombre del concepto.

**Implementar la opción A** salvo que Joel diga lo contrario.

## 4. Cambios en el frontend

### 4.1 Campo "Monto mensual de este cliente"

El campo **ya existe** en el formulario "Editar cliente" y guarda en `standard_price`. Verificar que el backend (`PATCH /api/clients/:id`) lo acepte y lo persista; si aún no lo hace, agregar `standardPrice` al esquema del endpoint y al UPDATE (protegido como `cutoffDay`: solo se toca si viene en el body).

Actualizar la **ayuda del campo** para que diga claramente que es lo que se usa en la factura:
```
Lo que se le cobra cada ciclo. La factura automática usa este monto.
```

### 4.2 Formulario "Plan y día de corte"

Sigue igual: el selector de plan prellena `standard_price` al asignar (con la lógica de 2.6, sin pisar precio existente). El usuario puede cambiar el precio en "Editar cliente" después.

### 4.3 Formulario "Nuevo cliente"

Al crear un cliente, el plan seleccionado prellena el `standard_price` como hoy. Sin cambios aquí.

### 4.4 Vista del expediente

Donde hoy dice `plan.name · $plan.price`, cambiar a mostrar `standard_price` como fuente de verdad del monto. Si tiene plan asignado, mostrar el nombre del plan como referencia. Si no, "Mensualidad personalizada".

## 5. Lo que NO cambia

- **Paquetes**: su precio vive en `session_packages.amount` y se define al crear el saldo. No pasa por `generateRecurringInvoices`. Sin cambios.
- **Crédito (no anticipado)**: la factura de crédito se calcula por sesiones reales × `credit_session_price`. `standard_price` solo aplica a anticipados. Sin cambios.
- **Cobros manuales**: el monto es lo que Eileen escribe. Sin cambios.
- **Facturas ya emitidas**: nunca se tocan. Sin cambios.
- **Saldos de sesiones**: las sesiones salen de `monthly_session_target` o `sessions_included` del plan (como fallback). Sin cambios en la lógica de sesiones.
- **Contratos informativos (v304-v309)**: los contratos ya leen `standard_price` del perfil. Sin cambios.
- **Coberturas familiares**: cada beneficiario mantiene su propio `standard_price`. Sin cambios en la lógica de agrupación.

## 6. Pruebas obligatorias

1. **Mensualidad con plan**: cliente con `plan_id` y `standard_price` diferente al precio del plan → la factura generada usa `standard_price`, NO `plan.price`.
2. **Mensualidad sin plan**: cliente con `plan_id = NULL` y `standard_price = 160` → factura de $160.
3. **Plan familiar**: Riccardo paga por Ernesto e Iraida. Cada uno tiene su `standard_price`. La factura consolidada suma los tres `standard_price`. Cambiar el `standard_price` de Ernesto de $120 a $160 → la siguiente factura refleja $160 para Ernesto.
4. **Editar plan del catálogo**: cambiar el precio del plan de $120 a $200 → los clientes que lo tienen asignado conservan su `standard_price` sin cambios.
5. **Asignar plan a cliente nuevo** (sin precio): `standard_price` se prellena con `plan.price`. Asignar plan a cliente **con precio propio**: `standard_price` no se pisa.
6. **Campo "Monto mensual"**: editarlo en el expediente → se guarda en `standard_price`. La siguiente factura generada usa el nuevo monto.
7. **Paquete**: asignar un plan de paquete → no toca `standard_price`. El saldo del paquete usa `plan.price` para su `amount`. Sin regresión.
8. **Crédito**: la factura no anticipada se calcula por sesiones × `credit_session_price`. `standard_price` no interviene. Sin regresión.
9. **Concepto de la factura**: si el cliente tiene plan, el concepto dice el nombre del plan; si no, "Mensualidad".
10. **Anular y regenerar**: anular una factura automática → "Generar cobros pendientes" crea una nueva para el mismo periodo, sin conflicto de índice, con el monto correcto de `standard_price`.
11. Pantalla (jsdom, 375 px): el campo "Monto mensual" aparece solo en clientes mensuales, se guarda, y no hay errores JS.

`npm run verify` y suite completa en verde (UTC, Node 22). Di qué NO probaste.

## 7. Reglas del proyecto

`git fetch` antes de numerar (v309 → **v310**; migración **073** para recrear el índice de facturas automáticas). Define todo lo que llames en `app.js`; versión en `app.js`, `sw.js`, `version.json` y `?v=` de `index.html`; dd-mm-aaaa, HH:mm, hora de Panamá, 375 px. Rama nueva desde `main`; sin push ni deploy; `[REVISAR-CLAUDE]` y lo que NO probaste.
