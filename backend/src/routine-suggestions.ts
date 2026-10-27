// Proponer una rutina con IA a partir de lo que escribe la entrenadora.
//
// La propuesta se ata al catálogo de ejercicios: el modelo sólo puede elegir
// nombres que ya existen. Si inventara ejercicios, la rutina saldría sin video
// —el cliente entrena solo mirando el video— y sin las indicaciones que Eileen
// escribió para cada uno. Lo que no esté en el catálogo se descarta.
//
// Nunca se guarda sola: devuelve un borrador que la entrenadora revisa, edita y
// aprueba. Es su criterio el que asigna una rutina a una persona, no el modelo.
import { config } from './config.js';

export const routineSuggestionsReady = Boolean(config.DEEPSEEK_API_KEY);

export type CatalogEntry = { name: string; section: string; level?: string | null; machine?: string | null; freeWeight?: string | null };
export type HistoryEntry = { title: string; assignedOn: string | null; sections: string[] };

export type SuggestedRoutine = {
  title: string;
  description: string;
  sessionsPerWeek: number;
  exercises: Array<{ name: string; sets?: number; reps?: string; notes?: string; block?: number; rounds?: number }>;
  rationale: string;
  avoided: string[];
};

const textoSeguro = (value: unknown, fallback: string, max = 500) => {
  const texto = String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
  return texto || fallback;
};

export function formatRoutineDescription(partes: { objective?: unknown; warmup?: unknown; cooldown?: unknown; stretching?: unknown }) {
  return [
    `OBJETIVO\n${textoSeguro(partes.objective, 'Entrenamiento personalizado según la indicación de la entrenadora.')}`,
    `CALENTAMIENTO · 5–10 MINUTOS\n${textoSeguro(partes.warmup, 'Realiza movilidad suave y aumenta gradualmente la intensidad antes de comenzar.')}`,
    'EJERCICIOS PRINCIPALES\nRealiza los ejercicios que aparecen abajo en el orden indicado. Respeta las series, repeticiones y notas de cada ejercicio.',
    `VUELTA A LA CALMA · 3–5 MINUTOS\n${textoSeguro(partes.cooldown, 'Baja poco a poco la intensidad, camina suavemente y controla la respiración.')}`,
    `ESTIRAMIENTOS · 5–8 MINUTOS\n${textoSeguro(partes.stretching, 'Termina con estiramientos suaves, sin rebotes y sin llegar al dolor.')}`
  ].join('\n\n');
}

const SECCIONES: Record<string, string> = {
  tren_inferior: 'tren inferior',
  tren_superior: 'tren superior',
  core: 'core',
  cardio: 'cardio',
  hit: 'HIT'
};

function apiError(payload: unknown, status: number) {
  const cuerpo = payload as { error?: { message?: string } };
  return new Error(cuerpo?.error?.message || `DeepSeek respondió ${status}`);
}

export async function suggestRoutine(entrada: {
  descripcion: string;
  catalogo: CatalogEntry[];
  historial: HistoryEntry[];
  condiciones: string[];
  repetirGrupos: boolean;
  clienteNombre?: string;
  // Rutina para que el cliente la haga por su cuenta (clase cancelada): se dimensiona a la duración de la clase y la descripción son las instrucciones que él leerá.
  paraCliente?: boolean;
  duracionMinutos?: number;
  // Rutina para un cliente que viaja (J-107): sin máquinas ni equipo, que se pueda hacer en un cuarto de hotel o con peso corporal.
  paraViaje?: boolean;
}) {
  if (!routineSuggestionsReady) throw new Error('Falta configurar la clave de DeepSeek');

  const gruposRecientes = [...new Set(entrada.historial.flatMap(item => item.sections))];
  const evitar = entrada.repetirGrupos ? [] : gruposRecientes;

  const instrucciones = [
    'Eres asistente de una entrenadora personal en Panamá. Propones rutinas, no las apruebas.',
    'Elige ejercicios ÚNICAMENTE de la lista del catálogo, copiando el nombre exacto. No inventes ejercicios.',
    // La entrenadora escribe una línea breve (J-111), p. ej. "45 minutos, espalda, tríceps y pierna; tiene mancuernas y bandas". Es la autoridad: ella sabe con qué cuenta el cliente.
    'Lo que escribe la entrenadora MANDA: si indica la duración, los grupos musculares a trabajar o el equipo o lugar con que cuenta el cliente, respétalo. '
      + 'Si dice qué equipo tiene disponible, elige ÚNICAMENTE ejercicios del catálogo que se puedan hacer con ese equipo y no incluyas ejercicios que requieran otro. '
      + 'En el catálogo, la máquina y el peso libre de cada ejercicio aparecen entre paréntesis; "peso corporal" significa que no requiere equipo.',
    'Responde sólo JSON válido con esta forma: {"title":string,"description":string,"warmup":string,"cooldown":string,"stretching":string,"sessionsPerWeek":number,'
      + '"exercises":[{"name":string,"sets":number,"reps":string,"notes":string,"block":number,"rounds":number}],"rationale":string}',
    // Bloques (J-113): Eileen arma sus rutinas en circuitos, p. ej. "3 rondas de los primeros 3 ejercicios y otras 3 rondas del segundo bloque de tres".
    'ESTRUCTURA EN BLOQUES: organiza la rutina en bloques (circuitos). Cada ejercicio lleva "block" (1, 2, 3…, en el orden en que se hacen) y "rounds" (cuántas rondas se repite ese bloque; es el MISMO número para todos los ejercicios del bloque). '
      + 'En un bloque se hacen sus ejercicios seguidos, en orden, y se repite el bloque "rounds" veces; por eso "sets" debe ser igual a "rounds" y "reps" es lo que se hace en cada ronda. '
      + 'Por omisión usa bloques de 3 ejercicios (2 a 4 si hace falta) y 3 rondas por bloque. Si la entrenadora indica otra estructura (por ejemplo "2 bloques de 4 ejercicios, 4 rondas cada uno"), respétala. '
      + 'Solo si la entrenadora pide expresamente ejercicios sueltos por series, omite "block" y "rounds".',
    'Entre 4 y 10 ejercicios (si la entrenadora fija el número de bloques, 3 a 5 ejercicios por bloque). "reps" es texto libre ("12", "30 seg", "10 por lado").',
    'El campo description resume el objetivo. Los campos warmup, cooldown y stretching son obligatorios: escribe instrucciones concretas, en español, con duración aproximada y sin dejarlos vacíos.',
    'warmup debe explicar cómo preparar el cuerpo; cooldown debe indicar cómo bajar la intensidad y respirar; stretching debe nombrar los estiramientos recomendados y cómo hacerlos sin dolor.',
    'La sección de ejercicios principales se mostrará con la lista de ejercicios, por lo que no la repitas dentro de description.',
    'El campo rationale explica en una o dos frases por qué elegiste ese enfoque, en español.'
  ];

  const pedido = leerPeticion(entrada.descripcion);
  if (pedido.bloques || pedido.rondas || pedido.porBloque || pedido.minutos) {
    instrucciones.push(
      'LA ENTRENADORA FIJÓ ESTA ESTRUCTURA (es obligatoria, sobre cualquier valor por omisión): '
      + [pedido.bloques ? `EXACTAMENTE ${pedido.bloques} bloque${pedido.bloques === 1 ? '' : 's'} (no más, no menos)` : '', pedido.porBloque ? `${pedido.porBloque} ejercicios por bloque` : '', pedido.rondas ? `${pedido.rondas} rondas por bloque` : '',
        pedido.minutos ? `duración total de ${pedido.minutos} minutos incluyendo ~${MINUTOS_FIJOS} de calentamiento, vuelta a la calma y estiramientos; elige ejercicios y repeticiones para que la parte principal dure unos ${Math.max(10, pedido.minutos - MINUTOS_FIJOS)} minutos (cada ronda de un ejercicio de ~12 repeticiones toma ~45 segundos con la transición, y entre rondas se descansa ~1 minuto)` : ''].filter(Boolean).join('; ') + '.'
    );
  }
  if (entrada.paraCliente) {
    instrucciones.push(
      'Esta rutina la hará el cliente POR SU CUENTA, sin entrenadora al lado, en lugar de su clase cancelada. '
      + `Dimensiónala para unos ${entrada.duracionMinutos || 45} minutos en total, calentamiento incluido (salvo que la entrenadora indique otra duración), con ejercicios simples de ejecutar solo y con buena técnica. `
      + 'El campo "description" son las INSTRUCCIONES para el cliente, escritas en segunda persona (tú) y en español: cómo calentar unos 5 minutos, cuánto descansar entre series, '
      + 'a qué esfuerzo trabajar, que mire la demostración en video de cada ejercicio antes de hacerlo y que pare si siente dolor. Máximo 450 caracteres, sin listas largas. '
      + 'En "notes" de cada ejercicio escribe una pista corta de técnica para esa persona.'
    );
  }
  if (entrada.paraViaje) {
    instrucciones.push(
      'El cliente está DE VIAJE y la hará por su cuenta, fuera de su gimnasio habitual. Si la entrenadora NO dice con qué equipo cuenta, supón peso corporal o bandas y evita lo que necesite máquina, barra o aparatos grandes; '
      + 'si lo dice, lo que ella indique manda. En "description" incluye una indicación de que puede hacerla en cualquier día del viaje y que descanse bien entre series.'
    );
  }
  if (entrada.condiciones.length) {
    instrucciones.push(
      `El cliente tiene estas lesiones o condiciones: ${entrada.condiciones.join('; ')}. `
      + 'Evita los ejercicios que las agraven y dilo en las notas del ejercicio cuando sea relevante.'
    );
  }
  if (evitar.length) {
    instrucciones.push(
      `En sus rutinas recientes ya se trabajó: ${evitar.map(s => SECCIONES[s] || s).join(', ')}. `
      + 'Prioriza los grupos musculares que NO aparecen ahí, para no repetir. Si la descripción de la '
      + 'entrenadora pide expresamente uno de esos grupos, respétala: su instrucción manda.'
    );
  } else if (entrada.repetirGrupos) {
    instrucciones.push('La entrenadora pidió repetir los mismos grupos musculares aunque se hayan trabajado hace poco.');
  }

  const catalogoTexto = entrada.catalogo
    .map(e => {
      const libre = e.freeWeight && !/^no aplica/i.test(e.freeWeight) ? `peso libre: ${e.freeWeight}` : '';
      const maquina = e.machine && !/^no aplica/i.test(e.machine) ? `máquina: ${e.machine}` : '';
      return `- ${e.name} [${SECCIONES[e.section] || e.section}] (${[maquina, libre].filter(Boolean).join('; ') || 'peso corporal'})`;
    })
    .join('\n');
  const historialTexto = entrada.historial.length
    ? entrada.historial.map(h => `- ${h.assignedOn || 'sin fecha'}: ${h.title} → ${h.sections.map(s => SECCIONES[s] || s).join(', ') || 'sin clasificar'}`).join('\n')
    : 'Sin rutinas previas registradas.';

  const respuesta = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      messages: [
        { role: 'system', content: instrucciones.join('\n') },
        {
          role: 'user',
          content: [
            entrada.clienteNombre ? `Cliente: ${entrada.clienteNombre}` : 'Rutina sin cliente asignado todavía.',
            `Lo que pide la entrenadora: ${entrada.descripcion}`,
            '',
            'Rutinas recientes de este cliente:',
            historialTexto,
            '',
            'Catálogo disponible (usa estos nombres exactos):',
            catalogoTexto
          ].join('\n')
        }
      ]
    }),
    signal: AbortSignal.timeout(90000)
  });

  const payload = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw apiError(payload, respuesta.status);

  const eleccion = (payload as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> }).choices?.[0];
  if (!eleccion?.message?.content && eleccion?.finish_reason === 'length') {
    throw new Error('El modelo agotó el presupuesto de tokens antes de escribir la respuesta');
  }
  let cruda: Record<string, unknown>;
  try { cruda = JSON.parse(String(eleccion?.message?.content ?? '')); }
  catch { throw new Error('El modelo no devolvió una rutina legible'); }

  // Se filtra contra el catálogo: lo que el modelo se haya inventado no entra.
  const porNombre = new Map(entrada.catalogo.map(e => [e.name.toLowerCase(), e]));
  const propuestos = Array.isArray(cruda.exercises) ? cruda.exercises : [];
  const descartados: string[] = [];
  const ejercicios = propuestos.flatMap((item: Record<string, unknown>) => {
    const nombre = String(item?.name ?? '').trim();
    const encontrado = porNombre.get(nombre.toLowerCase());
    if (!encontrado) { if (nombre) descartados.push(nombre); return []; }
    const series = Number(item?.sets);
    const bloque = Number(item?.block); const rondas = Number(item?.rounds);
    return [{
      name: encontrado.name,
      sets: Number.isFinite(series) && series >= 1 && series <= 20 ? Math.round(series) : 3,
      reps: String(item?.reps ?? '').slice(0, 40) || '12',
      notes: String(item?.notes ?? '').slice(0, 300) || undefined,
      block: Number.isFinite(bloque) && bloque >= 1 && bloque <= 20 ? Math.round(bloque) : undefined,
      rounds: Number.isFinite(rondas) && rondas >= 1 && rondas <= 10 ? Math.round(rondas) : undefined
    }];
  });

  if (!ejercicios.length) throw new Error('La propuesta no incluyó ningún ejercicio del catálogo. Prueba a describirla de otra forma.');
  normalizarBloques(ejercicios);
  const peticion = leerPeticion(entrada.descripcion);
  const ajuste = aplicarPeticion(ejercicios, peticion);

  const semanales = Number(cruda.sessionsPerWeek);
  return {
    title: String(cruda.title ?? '').trim().slice(0, 120) || 'Rutina propuesta',
    description: formatRoutineDescription({ objective: cruda.description, warmup: cruda.warmup, cooldown: cruda.cooldown, stretching: cruda.stretching }),
    sessionsPerWeek: Number.isFinite(semanales) && semanales >= 1 && semanales <= 7 ? Math.round(semanales) : 3,
    exercises: ejercicios,
    rationale: [String(cruda.rationale ?? '').trim().slice(0, 500), ...ajuste.notas, `Duración estimada: unos ${ajuste.minutos} minutos en total (calentamiento, parte principal, vuelta a la calma y estiramientos)${ajuste.bloques ? `, en ${ajuste.bloques} bloque${ajuste.bloques === 1 ? '' : 's'}` : ''}.`].filter(Boolean).join(' '),
    estimatedMinutes: ajuste.minutos,
    avoided: evitar.map(s => SECCIONES[s] || s),
    descartados
  };
}

// Deja los bloques coherentes aunque el modelo se equivoque: sin números repetidos fuera de orden, todos los ejercicios de un bloque con las mismas rondas (las del primero) y "sets" igual a
// "rounds". Un ejercicio sin bloque entre otros con bloque se queda en el bloque del anterior; si ninguno trae bloque, la rutina queda como lista de ejercicios sueltos.
export function normalizarBloques(ejercicios: Array<{ sets?: number; block?: number; rounds?: number }>) {
  if (!ejercicios.some(item => item.block)) { ejercicios.forEach(item => { delete item.block; delete item.rounds; }); return; }
  let anterior: number | undefined;
  for (const item of ejercicios) { if (!item.block) item.block = anterior ?? 1; anterior = item.block; }
  const orden = ejercicios.map((item, posicion) => ({ item, posicion })).sort((a, b) => (a.item.block! - b.item.block!) || (a.posicion - b.posicion)).map(entrada => entrada.item);
  ejercicios.splice(0, ejercicios.length, ...orden);
  const numeros = new Map<number, number>(); const rondas = new Map<number, number>();
  for (const item of ejercicios) {
    if (!numeros.has(item.block!)) numeros.set(item.block!, numeros.size + 1);
    const nuevo = numeros.get(item.block!)!;
    if (!rondas.has(nuevo)) rondas.set(nuevo, item.rounds ?? 3);
    item.block = nuevo; item.rounds = rondas.get(nuevo); item.sets = item.rounds;
  }
}


// ── Lo que pide la entrenadora, leído por el código ──────────────────────────────────────────
// El modelo tiende a repetir su estructura por omisión (3 bloques de 3) y no sabe cuánto dura un circuito. Lo que ella ESCRIBE de forma explícita (bloques, rondas, ejercicios por bloque,
// minutos) se lee aquí y se hace cumplir sobre la respuesta; el modelo solo propone los ejercicios.
export type PeticionEstructura = { bloques?: number; rondas?: number; porBloque?: number; minutos?: number };
const NUMEROS: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
const numeroDe = (texto: string) => /^\d+$/.test(texto) ? Number(texto) : NUMEROS[texto.toLowerCase()];
const CIFRA = '(\\d+|un|uno|una|dos|tres|cuatro|cinco|seis)';

export function leerPeticion(texto: string): PeticionEstructura {
  const t = String(texto || '').toLowerCase();
  const salida: PeticionEstructura = {};
  const bloques = t.match(new RegExp(`\\b${CIFRA}\\s+(?:bloques?|circuitos?)\\b`));
  if (bloques) { const n = numeroDe(bloques[1]); if (n >= 1 && n <= 6) salida.bloques = n; }
  const rondas = t.match(new RegExp(`\\b${CIFRA}\\s+(?:rondas?|vueltas?)\\b`));
  if (rondas) { const n = numeroDe(rondas[1]); if (n >= 1 && n <= 10) salida.rondas = n; }
  const porBloque = t.match(new RegExp(`\\b(?:de|con|por bloque)\\s+${CIFRA}\\s+ejercicios?\\b`));
  if (porBloque) { const n = numeroDe(porBloque[1]); if (n >= 2 && n <= 8) salida.porBloque = n; }
  let minutos: number | undefined;
  const min = t.match(/\b(\d{2,3})\s*(?:min\b|mins\b|minutos?\b|')/);
  if (min) minutos = Number(min[1]);
  else if (/\bhora y media\b/.test(t)) minutos = 90;
  else if (/\bmedia hora\b/.test(t)) minutos = 30;
  else { const h = t.match(/\b(\d(?:[.,]5)?|una|dos)\s*(?:h\b|horas?\b)/); if (h) minutos = Math.round((numeroDe(h[1]) ?? Number(h[1].replace(',', '.'))) * 60); }
  if (minutos && minutos >= 15 && minutos <= 120) salida.minutos = minutos;
  return salida;
}

// Segundos que lleva UNA serie (o una pasada por el ejercicio en un circuito): lo que dice "reps" ("12", "30 seg", "1 min", "10 por lado").
export function segundosDeEjercicio(reps: unknown) {
  const texto = String(reps ?? '').toLowerCase();
  const tiempo = texto.match(/(\d+(?:[.,]\d+)?)\s*(min|minutos?|seg|segundos?|s)\b/);
  const lados = /por (?:lado|pierna|brazo)|c\/lado|cada (?:lado|pierna|brazo)/.test(texto) ? 2 : 1;
  if (tiempo) { const n = Number(tiempo[1].replace(',', '.')); return Math.round((tiempo[2].startsWith('m') ? n * 60 : n) * lados); }
  const rep = texto.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
  const n = rep ? (rep[2] ? (Number(rep[1]) + Number(rep[2])) / 2 : Number(rep[1])) : 12;
  return Math.round(n * 3.5 * lados);   // ~3,5 s por repetición, con la bajada controlada
}

type EjercicioEstimable = { reps?: string; sets?: number; block?: number; rounds?: number };
const TRANSICION = 15;          // cambiar de ejercicio: cambiar de lugar, tomar la mancuerna
const DESCANSO_RONDA = 60;      // entre rondas de un circuito
const DESCANSO_BLOQUE = 90;     // cambio de bloque: preparar otro equipo
const DESCANSO_SERIE = 50;      // entre series de un ejercicio suelto
export const MINUTOS_FIJOS = 18; // calentamiento (5–10) + vuelta a la calma (3–5) + estiramientos (5–8), a media

// Minutos de la parte principal. Un bloque dura sus rondas × (todos sus ejercicios con su transición) + los descansos entre rondas; los ejercicios sueltos, sus series con descanso.
export function minutosPrincipales(ejercicios: EjercicioEstimable[]) {
  let segundos = 0;
  const bloques = new Map<number, EjercicioEstimable[]>();
  for (const e of ejercicios) {
    if (e.block) bloques.set(e.block, [...(bloques.get(e.block) ?? []), e]);
    else { const series = e.sets || 3; segundos += series * (segundosDeEjercicio(e.reps) + TRANSICION) + (series - 1) * DESCANSO_SERIE; }
  }
  let primero = true;
  for (const lista of bloques.values()) {
    const rondas = lista[0].rounds || 3;
    if (!primero) segundos += DESCANSO_BLOQUE; primero = false;
    segundos += rondas * lista.reduce((suma, e) => suma + segundosDeEjercicio(e.reps) + TRANSICION, 0) + (rondas - 1) * DESCANSO_RONDA;
  }
  return segundos / 60;
}
export const minutosTotales = (ejercicios: EjercicioEstimable[]) => Math.round(minutosPrincipales(ejercicios) + MINUTOS_FIJOS);

// Reparte los ejercicios, en su orden, en `cuantos` bloques lo más parejos posible (los primeros reciben el sobrante).
function repartirEnBloques(ejercicios: EjercicioEstimable[], cuantos: number) {
  const base = Math.floor(ejercicios.length / cuantos); const extra = ejercicios.length % cuantos; let i = 0;
  for (let b = 1; b <= cuantos; b += 1) { const tam = base + (b <= extra ? 1 : 0); for (let k = 0; k < tam; k += 1) ejercicios[i++].block = b; }
}

// Hace cumplir lo que ella pidió. Devuelve lo que decidió, para explicárselo.
export function aplicarPeticion(ejercicios: EjercicioEstimable[], peticion: PeticionEstructura) {
  const notas: string[] = [];
  let rondasFijas = peticion.rondas;
  // Estructura: número de bloques o tamaño de bloque pedidos.
  if (peticion.bloques || peticion.porBloque) {
    const cuantos = peticion.bloques ?? Math.max(1, Math.round(ejercicios.length / peticion.porBloque!));
    const maximo = cuantos * (peticion.porBloque ?? 5);
    if (ejercicios.length > maximo) ejercicios.splice(maximo);
    const efectivos = Math.min(cuantos, Math.max(1, Math.floor(ejercicios.length / 2)));
    repartirEnBloques(ejercicios, efectivos);
    if (efectivos < cuantos) notas.push(`Pediste ${cuantos} bloques pero solo hubo ejercicios para ${efectivos}.`);
    const rondas = ejercicios.find(e => e.rounds)?.rounds ?? 3;
    ejercicios.forEach(e => { e.rounds = rondas; e.sets = rondas; });
  }
  const bloquesFinales = new Set(ejercicios.map(e => e.block).filter(Boolean)).size;
  const fijarRondas = (n: number) => ejercicios.forEach(e => { if (e.block) { e.rounds = n; e.sets = n; } else e.sets = n; });
  if (rondasFijas && bloquesFinales) fijarRondas(rondasFijas);
  // Duración: se busca el número de rondas (o series) que más se acerque al tiempo pedido; si ni con 2 alcanza, se quita el último ejercicio de los bloques más largos.
  if (peticion.minutos) {
    const objetivo = Math.max(10, peticion.minutos - MINUTOS_FIJOS);
    const mejorRonda = () => {
      let mejor = 2; let distancia = Infinity;
      for (let n = 2; n <= 5; n += 1) { fijarRondas(n); const d = Math.abs(minutosPrincipales(ejercicios) - objetivo); if (d < distancia) { distancia = d; mejor = n; } }
      return mejor;
    };
    const minimo = () => { const porBloque = new Map<number, number>(); ejercicios.forEach(e => porBloque.set(e.block ?? 0, (porBloque.get(e.block ?? 0) ?? 0) + 1)); return porBloque; };
    if (!rondasFijas) fijarRondas(mejorRonda());
    let seguridad = 12;
    while (minutosPrincipales(ejercicios) > objetivo * 1.15 && seguridad-- > 0) {
      const conteo = minimo(); const candidato = [...ejercicios].reverse().find(e => (conteo.get(e.block ?? 0) ?? 0) > (e.block ? 2 : 1) && ejercicios.length > 3);
      if (!candidato) break;
      ejercicios.splice(ejercicios.indexOf(candidato), 1);
      if (!rondasFijas) fijarRondas(mejorRonda());
    }
  }
  return { notas, minutos: minutosTotales(ejercicios), bloques: new Set(ejercicios.map(e => e.block).filter(Boolean)).size };
}
