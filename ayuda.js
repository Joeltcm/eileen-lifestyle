// ── Centro de ayuda ──────────────────────────────────────────────────────────────────────────────────────────────
// Guía dentro de la aplicación, escrita para Eileen: temas con pasos numerados, consejos (💡) y avisos (⚠️), búsqueda, un camino
// para la primera semana, glosario y “qué hago si…”. Cada botón o pantalla que se menciona va entre «comillas angulares» y se
// pinta como una etiqueta; una prueba comprueba que esos nombres siguen existiendo en la aplicación, para que la ayuda no
// se quede vieja cuando cambie la pantalla. Comparte el ámbito global con app.js (navigate, escapeHtml, openModal…).

// Bloques: P (párrafo), STEPS (pasos), TIP, WARN, NOTE, FAQ, GO (botones que llevan a la pantalla), TABLE.
const helpP = text => ({ t: 'p', text });
const helpSteps = (title, items) => ({ t: 'steps', title, items });
const helpTip = text => ({ t: 'tip', text });
const helpWarn = text => ({ t: 'warn', text });
const helpNote = text => ({ t: 'note', text });
const helpFaq = items => ({ t: 'faq', items });
const helpGo = items => ({ t: 'go', items });
const helpTable = (head, rows) => ({ t: 'table', head, rows });

// ── Guía para instalar la app (PWA) como acceso directo ─────────────────────────────────────────────────────────
// La usan cuatro sitios: el centro de ayuda de Eileen, la pantalla de acceso, la bienvenida del cliente al crear su contraseña
// y la guía rápida del portal. Los botones de los navegadores van en **negrita** (no son etiquetas de esta aplicación).
const pwaGuide = {
  platforms: [
    {
      id: 'iphone', icon: '📱', label: 'iPhone / iPad',
      intro: 'En iPhone y iPad **tiene que ser desde Safari** (el ícono de la brújula azul). Dura menos de un minuto.',
      steps: [
        'Abre la dirección del portal en **Safari**. Si llegaste desde WhatsApp o desde un correo, toca la brújula (o los tres puntos) y elige **Abrir en Safari**.',
        'Toca el botón **Compartir**: un cuadrado con una flecha hacia arriba ⬆️. Está abajo, en el centro de la pantalla (en iPad, arriba a la derecha).',
        'Desliza el menú hacia arriba y toca **Agregar a pantalla de inicio** ➕. Si no lo ves, baja hasta el final de la lista y toca **Editar acciones**.',
        'Deja el nombre «Eileen Lifestyle» y toca **Agregar**, arriba a la derecha.',
        'Listo 🎉 En tu pantalla de inicio aparece el ícono. **Abre siempre la app desde ese ícono**, no desde Safari.',
        'La primera vez desde el ícono te pedirá tu correo y tu contraseña, porque la app instalada guarda su propia sesión. Después ya no te la pide.',
        'Para recibir avisos: abre la app desde el ícono, toca la campanita 🔔 y activa «Notificaciones push en este dispositivo». En iPhone los avisos solo funcionan con la app instalada y con iOS 16.4 o más nuevo.'
      ]
    },
    {
      id: 'android', icon: '🤖', label: 'Android',
      intro: 'En Android lo más fácil es con **Chrome**. Dura menos de un minuto.',
      steps: [
        'Abre la dirección del portal en **Chrome**. Si llegaste desde WhatsApp, toca los tres puntos y elige **Abrir en Chrome**.',
        'Toca los **tres puntos** ⋮ de arriba a la derecha.',
        'Toca **Instalar aplicación** (en algunos teléfonos dice **Agregar a la pantalla principal**).',
        'Confirma con **Instalar**. Si te pregunta si quieres agregarla, toca **Agregar**.',
        'Listo 🎉 El ícono aparece en tu pantalla de inicio y en tu lista de aplicaciones. Ábrela siempre desde ahí.',
        'La primera vez te pedirá tu correo y tu contraseña. Después ya no.',
        'Para recibir avisos: abre la app, toca la campanita 🔔, activa «Notificaciones push en este dispositivo» y, cuando te lo pregunte el teléfono, toca **Permitir**.',
        'Si usas el navegador **Samsung Internet**: toca el menú ≡ → **Agregar página a** → **Pantalla de inicio**.'
      ]
    },
    {
      id: 'pc', icon: '💻', label: 'Computadora',
      intro: 'En computadora funciona con **Chrome** o **Edge**.',
      steps: [
        'Abre la dirección del portal en Chrome o Edge.',
        'A la derecha de la barra de direcciones aparece un ícono de **instalar** (una pantallita con una flecha). Tócalo. Si no lo ves, abre el menú ⋮ y busca **Instalar Eileen Lifestyle** (o **Guardar y compartir → Instalar como app**).',
        'Confirma con **Instalar**. Se abre en su propia ventana, como cualquier programa, y queda en tu lista de aplicaciones.',
        'En una Mac con Safari: menú **Archivo → Agregar al Dock**.'
      ]
    }
  ],
  problems: [
    { q: 'No me aparece **Agregar a pantalla de inicio** en el iPhone.', a: 'Casi siempre es porque estás en el navegador interno de WhatsApp o en otro navegador. Toca la brújula o los tres puntos y elige **Abrir en Safari**; luego repite desde el botón Compartir.' },
    { q: 'Instalé la app y me pide iniciar sesión otra vez.', a: 'Es normal la primera vez: la app instalada guarda su propia sesión. Entra con tu correo y la contraseña que creaste; después te recuerda por semanas.' },
    { q: 'Toqué mi enlace y dice que ya no es válido.', a: 'El enlace sirve **una sola vez** y vence a las 48 horas. Si ya creaste tu contraseña, no lo necesitas: entra a la dirección del portal con tu correo y tu contraseña. Si no la recuerdas, pídele a Eileen un enlace nuevo.' },
    { q: 'Olvidé mi contraseña.', a: 'Escríbele a Eileen y te manda un enlace nuevo para crear otra. Tu entrenadora nunca ve tu contraseña.' },
    { q: 'La app se ve igual que ayer, sin los cambios nuevos.', a: 'Ciérrala del todo (deslízala fuera de las aplicaciones abiertas) y ábrela otra vez; a veces hace falta abrirla dos veces para que se actualice.' },
    { q: 'No me llegan los avisos.', a: 'Revisa que la app esté instalada, que hayas activado «Notificaciones push en este dispositivo» desde la campanita y que el teléfono permita notificaciones de Eileen Lifestyle en sus ajustes.' }
  ]
};

// ── Novedades ───────────────────────────────────────────────────────────────────────────────────────────────────
// CADA VEZ que se publique algo que Eileen vaya a notar, se agrega una entrada AL PRINCIPIO de esta lista (la más nueva primero).
// Le sale una sola vez al entrar a la aplicación (queda marcado en su usuaria, no en el aparato) y después la puede volver a ver en
// «✨ Novedades» del menú de su cuenta o en el tema Novedades del centro de ayuda. El id es 'aaaa-mm-dd-nombre' (se ordena por fecha).
// Las correcciones pequeñas que nadie nota no necesitan entrada. Los nombres de pantallas y botones van entre «comillas angulares».
const whatsNewReleases = [
  {
    id: '2026-10-30-rutinas-fecha-flexible', version: 338, date: '30-10-2026', title: 'Rutinas con fecha límite flexible',
    items: [
      { icon: '📅', title: 'Agenda rutinas más allá del ciclo actual', text: 'Ahora puedes poner una fecha límite que caiga fuera del ciclo de facturación en curso. Antes se recortaba al cierre del ciclo; ahora se respeta la fecha que elijas.' },
      { icon: '🔗', title: 'El enlace dura hasta la fecha límite', text: 'Si la rutina tiene fecha límite, el enlace que compartes dura al menos hasta ese día. Antes podía expirar antes de que el cliente pudiera completarla.' },
      { icon: '💬', title: 'Mensaje de WhatsApp más claro', text: 'El texto de WhatsApp ahora solo muestra la fecha límite de la rutina, sin mencionar el vencimiento técnico del enlace.' }
    ]
  },
  {
    id: '2026-10-28-detalle-clases-en-factura', version: 336, date: '28-10-2026', title: 'Cantidad de clases en las facturas',
    items: [
      { icon: '🧾', title: 'El concepto detalla las clases incluidas', text: 'Las facturas nuevas muestran la cantidad de clases en el concepto, por ejemplo "Mensualidad (8 clases)" en lugar de solo "Mensualidad". Asi el cliente entiende mejor lo que esta pagando.' }
    ]
  },
  {
    id: '2026-10-28-alertas-de-ritmo', version: 335, date: '28-10-2026', title: 'Seguimiento de ritmo de rutinas',
    items: [
      { icon: '📊', title: 'Aviso cuando un cliente se atrasa', text: 'Si un cliente con plan de rutinas no completa su rutina en el plazo esperado (por ejemplo, 4 dias para un plan de 8 al mes), recibes una notificacion push para que le des seguimiento. El aviso se reinicia cada vez que el cliente completa una rutina.' },
      { icon: '✈️', title: 'Aviso de rutina de viaje sin completar', text: 'Cuando envias una rutina de viaje y el cliente no la completa en 3 dias, recibes un aviso para que no se pierda ese entrenamiento.' }
    ]
  },
  {
    id: '2026-10-27-rutinas-ia-bloques-y-tiempo', version: 334, date: '27-10-2026', title: 'Rutinas con IA: los bloques y el tiempo que pides',
    items: [
      { icon: '🧩', title: 'Si pides 2 bloques, salen 2 bloques', text: 'Al proponer una rutina con IA, lo que escribes se respeta: "2 bloques", "4 rondas", "bloques de 4 ejercicios". Antes casi siempre salían 3 bloques; ahora la app lo reordena a lo que pediste.' },
      { icon: '⏱️', title: 'El tiempo ahora se calcula de verdad', text: 'Si escribes "45 minutos", la app ajusta las rondas y los ejercicios para que la rutina dure eso, contando calentamiento, descansos, vuelta a la calma y estiramientos. En la nota de la propuesta verás la duración estimada.' }
    ]
  },
  {
    id: '2026-10-27-rutinas-en-el-expediente', version: 332, date: '27-10-2026', title: 'Rutinas desde el expediente del cliente',
    items: [
      { icon: '🏋️', title: 'Crea la rutina desde el expediente', text: 'En el expediente del cliente, en «Rutinas enviadas», hay un botón para crear su rutina. Sale ya con el cliente elegido y, al guardarla, vuelves a su expediente con la rutina anotada en la lista.' },
      { icon: '↩️', title: 'Quita una rutina enviada por error', text: 'Cada envío de la lista tiene un botón «Quitar». Deja de estar asignada, el enlace deja de funcionar y sale del historial. Si el cliente ya la hizo no se puede quitar, porque ese entrenamiento queda registrado.' }
    ]
  },
  {
    id: '2026-10-26-google-calendar-sin-duplicados', version: 331, date: '26-10-2026', title: 'Google Calendar sin clases repetidas',
    items: [
      { icon: '📅', title: 'Cada clase aparece una sola vez en tu Google Calendar', text: 'Arreglamos el motivo por el que una misma clase podía salir dos o más veces en tu calendario. Las repetidas que ya había se retiran solas la próxima vez que se sincronice (al abrir la app): se queda la buena y no se toca ningún evento tuyo que no venga de la app.' }
    ]
  },
  {
    id: '2026-10-26-acceso-portal-y-firma', version: 328, date: '26-10-2026', title: 'Acceso al portal más fácil y tu firma en los contratos',
    items: [
      { icon: '🔑', title: 'Dar acceso al portal, listo en un toque', text: 'Al generar el acceso de un cliente ya sale un mensaje escrito con su enlace y la dirección del portal. Lo mandas por WhatsApp (abre el chat con su número), por correo o lo copias, y puedes editarlo antes de enviarlo.', go: { label: 'Ver cómo funciona', help: 'portal' } },
      { icon: '🔁', title: 'Si el cliente vuelve a tocar su enlace', text: 'El enlace sirve una sola vez, y antes el cliente quedaba perdido si lo tocaba de nuevo. Ahora la app le explica qué pasó, le deja entrar con su correo (ya escrito) y su contraseña, y le recuerda que puede pedirte un enlace nuevo.' },
      { icon: '📲', title: 'Guía para instalar la app en el teléfono', text: 'Cuando tu cliente crea su contraseña le aparece una guía paso a paso, con pestañas para iPhone, Android y computadora, para dejar la app como un ícono en su pantalla de inicio. También la tiene en su portal y tú en tu centro de ayuda.', go: { label: 'Ver la guía', help: 'instalar-app' } },
      { icon: '✍️', title: 'Tu firma en los contratos', text: 'Si aún no guardaste tu firma, la app te lo avisa en la sección Contrato y te deja guardarla en un toque; si ya la tienes, puedes cambiarla desde ahí. Si enviaste un contrato antes de guardarla, al firmarlo el cliente se usa la que tengas en ese momento.', go: { label: 'Ir a Clientes', view: 'clients' } }
    ]
  },
  {
    id: '2026-10-25-cotizador-ayuda-cumpleanos', version: 325, date: '25-10-2026', title: 'Cotizaciones, centro de ayuda y cumpleaños',
    items: [
      { icon: '🧾', title: 'Cotizaciones para tus clientes', text: 'Arma una propuesta con tus tarifas, un descuento y las cláusulas que quieras aplicar (como avisos). La compartes por WhatsApp, por enlace o en PDF y la app te avisa cuando la abren. Es informativa: no se convierte en factura.', go: { label: 'Ir a Cotizaciones', view: 'quotes' } },
      { icon: '💡', title: 'Centro de ayuda', text: 'Guías paso a paso, con buscador, para cada parte de la app. Encuentras el botón **ⓘ Ayuda** en cada pantalla y el atajo «¿Necesitas ayuda?» en el Resumen.', go: { label: 'Abrir la ayuda', help: 'empezar' } },
      { icon: '🎂', title: 'Aviso de cumpleaños de tus clientes', text: 'Te avisa dos días antes, en la campanita y con una notificación al teléfono, con un botón para felicitarles por WhatsApp. También ves los próximos en la tarjeta «Próximos cumpleaños» del Resumen. Para que funcione, guarda la fecha de nacimiento en el expediente de cada cliente.', go: { label: 'Ir al Resumen', view: 'dashboard' } },
      { icon: '📱', title: 'Resumen en iPad', text: 'El indicador de adherencia ya no tapa la foto del Resumen cuando usas el iPad.' }
    ]
  }
];

const helpCategories = [
  { id: 'empezar', icon: '🚀', title: 'Para empezar' },
  { id: 'dia', icon: '🗓️', title: 'Tu día a día' },
  { id: 'rutinas', icon: '🏋️', title: 'Rutinas' },
  { id: 'dinero', icon: '💰', title: 'Cobros y papeles' },
  { id: 'apoyo', icon: '🛟', title: 'Cuando algo no sale' }
];

const helpTopics = [
  {
    id: 'empezar', category: 'empezar', icon: '🚀', title: 'Primeros pasos', summary: 'Qué hay en cada pantalla, cómo usarla en el celular y por dónde empezar.',
    tags: 'inicio mapa pantallas celular instalar app teléfono iphone android ajustes cuenta whatsapp',
    blocks: [
      helpP('Esta aplicación junta tus clientes, tu agenda, tus rutinas y tus cobros en un solo lugar. No necesitas aprender todo de una vez: empieza por lo que haces cada día y usa esta ayuda cuando te surja una duda.'),
      helpTable(['Pantalla', 'Para qué la usas'], [
        ['🏠 «Resumen»', 'Una mirada rápida a la semana: clientes activos, sesiones, cobros pendientes.'],
        ['👥 «Clientes»', 'Los expedientes: datos, plan, saldo, rutinas, contratos, documentos y portal.'],
        ['📅 «Agenda»', 'Agendar clases, marcar quién entrenó, horarios fijos y cancelaciones.'],
        ['✅ «Asistencia»', 'El cumplimiento de cada cliente por mes o por corte, con informes.'],
        ['🏋️ «Rutinas»', 'Crear rutinas, asignarlas y consultar el catálogo de ejercicios.'],
        ['💳 «Facturación»', 'Facturas, cobros, próximas emisiones, reportes, tarifas y gastos.'],
        ['🧾 «Cotizaciones»', 'Propuestas informativas para tus clientes, con tus condiciones y avisos.']
      ]),
      helpSteps('En el celular', [
        { text: 'La barra de abajo tiene los seis destinos principales. «Cotizaciones» está arriba, en el botón con la hoja 📄 junto a la campana.' },
        { text: 'Instálala como una app: en **iPhone** abre la página en Safari, toca Compartir y elige “Agregar a pantalla de inicio”. En **Android** usa el menú del navegador y “Instalar aplicación”.' },
        { text: 'Las notificaciones push en iPhone solo funcionan con la app instalada en la pantalla de inicio. Actívalas desde la campanita 🔔 (más abajo, en «Avisos y notificaciones»).' },
        { text: 'Si la app parece vieja después de una actualización, ciérrala por completo y ábrela de nuevo. Si sigue igual, abre la dirección de la app agregando /refresh.html al final.' }
      ]),
      helpSteps('Tus datos de la cuenta', [
        { text: 'Toca tu avatar (arriba a la derecha) y elige «Ajustes de la cuenta».' },
        { text: 'Pon tu **WhatsApp** con código de país (solo dígitos). Es el que verán tus clientes en “Hablar con Eileen” y en las cotizaciones.' },
        { text: 'En «Datos para contratos» escribe tu nombre legal, identificación, domicilio y tu firma. Los contratos los usan automáticamente.' }
      ]),
      helpTip('¿Primera vez? Sigue el camino de “Tu primera semana” aquí abajo: son siete pasos cortos.'),
      helpSteps('Tu primera semana', [
        { text: '**Crea tus tarifas** en «Facturación» → «Planes» con «+ Crear tarifa» (por ejemplo, “Mensualidad 8 clases”).' },
        { text: '**Registra a tus clientes** con «+ Nuevo cliente»: nombre, plan y día de corte.' },
        { text: '**Cobra:** confirma el concepto en su «Plan de facturación» y crea la primera factura. Desde el siguiente corte se generan solas.' },
        { text: '**Agenda** sus clases con «+ Agendar sesión» (y «Repetir en» si siempre es el mismo horario).' },
        { text: '**Asigna rutinas** con «+ Crear rutina» para que las vean en su portal.' },
        { text: '**Contrato:** desde su expediente genera el contrato y envíalo a firmar.' },
        { text: '**Portal:** activa su acceso para que vea su agenda, sus rutinas y sus pagos.' }
      ]),
      helpGo([{ label: 'Ir a Clientes', view: 'clients' }, { label: 'Crear una tarifa', view: 'billing', hint: 'Facturación → Planes' }])
    ]
  },
  {
    id: 'instalar-app', category: 'empezar', icon: '📲', title: 'Instalar la app en el teléfono', summary: 'Crear el acceso directo (ícono) de la app en iPhone, Android o computadora, y qué hacer si algo no sale. Sirve para ti y para tus clientes.',
    tags: 'instalar app pwa acceso directo icono pantalla inicio iphone ipad android safari chrome telefono celular compartir agregar notificaciones',
    blocks: [
      helpP('Instalar la app le pone un **ícono** en la pantalla de inicio del teléfono, como cualquier otra aplicación: se abre a pantalla completa, no hay que buscar la dirección y es la única forma de recibir avisos en iPhone. No ocupa espacio ni pasa por la tienda de aplicaciones.'),
      helpTip('Tus clientes ven esta misma guía cuando crean su contraseña con tu enlace, y también en su portal. Si alguien te pregunta cómo, mándale esta pantalla o léesela paso a paso.'),
      ...pwaGuide.platforms.map(platform => helpSteps(`${platform.icon} ${platform.label}`, platform.steps.map(text => ({ text })))),
      helpWarn('En iPhone y iPad el acceso directo **solo se puede crear desde Safari**. Si el cliente abrió el enlace desde WhatsApp, que lo pase a Safari primero.'),
      helpFaq(pwaGuide.problems)
    ]
  },
  {
    id: 'novedades', category: 'empezar', icon: '✨', title: 'Novedades', summary: 'Lo que se ha agregado o mejorado en la app, con la fecha de cada cambio.',
    tags: 'novedades nuevo cambios actualizaciones version que hay de nuevo mejoras',
    blocks: [
      helpP('Aquí queda el historial de lo nuevo. Cada vez que se agrega algo importante te sale un aviso una sola vez al entrar; si lo cerraste sin leerlo, lo encuentras aquí o en «✨ Novedades» del menú de tu cuenta.'),
      ...whatsNewReleases.flatMap(release => [
        helpSteps(`${release.title} · ${release.date}`, release.items.map(item => ({ text: `${item.icon} **${item.title}.** ${item.text}` })))
      ]),
      helpTip('Para saber qué versión tienes, mira la etiqueta **PWA v…** arriba a la derecha. Si no ves lo nuevo, cierra la app por completo y ábrela otra vez (a veces hay que abrirla dos veces para que se actualice).')
    ]
  },
  {
    id: 'clientes', category: 'dia', icon: '👥', title: 'Clientes y expedientes', summary: 'Crear un cliente, qué trae su expediente y cómo cambiar su plan, su corte o su estado.',
    tags: 'cliente expediente nuevo crear editar plan corte pausa inactivo demo familia quien paga viaje eliminar',
    blocks: [
      helpP('Cada persona tiene un **expediente**: ahí vive todo lo suyo. Lo abres tocando «Ver expediente» en su tarjeta.'),
      helpSteps('Crear un cliente', [
        { text: 'En «Clientes» toca «+ Nuevo cliente» (también está en «Resumen»).' },
        { text: 'Escribe su nombre y elige su **Plan comercial** (tus tarifas). Si todavía no la tienes, créala primero en «Facturación» → «Planes».' },
        { text: 'Pon el **Día de corte**: el día del mes en que se le cobra y empieza su ciclo. Si empieza hoy, usa el día de hoy para que su primer ciclo salga completo.' },
        { text: 'Agrega correo y teléfono (el correo sirve para su portal; el teléfono para WhatsApp) y toca «Crear expediente».' }
      ]),
      helpP('Si marcas «Cliente demo (gratis)», la persona solo recibe rutinas promocionales: no tiene clases, saldo ni cobros. Cuando decida continuar, lo conviertes en cliente desde su expediente.'),
      helpTable(['En el expediente verás', 'Para qué sirve'], [
        ['📊 Plan y saldo', 'Su plan, el día de corte y cuántas clases le quedan.'],
        ['🧾 Plan de facturación', 'Lo que se le cobra y a quién (se explica en «Cobros y facturación»).'],
        ['🏋️ Rutinas enviadas / del ciclo', 'Qué rutinas recibió y cuántas ha hecho.'],
        ['📝 Contrato', 'Los contratos informativos y su firma.'],
        ['🧾 Cotizaciones', 'Las propuestas que le has hecho.'],
        ['📎 Documentos, InBody, fotos y condiciones', 'Su historial de salud y progreso (lesiones, mediciones, fotos).']
      ]),
      helpSteps('Cambiar algo de un cliente', [
        { text: '«Editar contacto» cambia nombre, correo, teléfono, estado y quién paga.' },
        { text: '«Editar plan y corte» cambia su plan y el día de corte.' },
        { text: 'El **estado** puede ser Activo, En pausa o Inactivo. Un cliente inactivo conserva su historial pero desaparece de la agenda y de los listados del día a día.' }
      ]),
      helpTip('Si alguien dejó de entrenar, ponlo **Inactivo** en vez de eliminarlo: así no pierdes su historial ni sus cobros. «Eliminar cliente» es para expedientes duplicados o creados por error.'),
      helpSteps('Familias y quién paga', [
        { text: 'En «Editar contacto» elige **Quién paga**. La factura sale a nombre de quien paga, con una línea por persona.' },
        { text: 'El progreso y la asistencia siguen siendo de cada uno; solo el cobro y el saldo van a nombre del pagador.' }
      ]),
      helpSteps('Cuando alguien viaja', [
        { text: 'En su expediente registra el **viaje** con fechas. Viajar no pausa su plan ni su cobro.' },
        { text: 'Prepárale una **rutina por enlace** para que entrene donde esté. Si la confirma el día de su clase, esa clase cuenta como dada.' }
      ]),
      helpNote('Los detalles de qué pasa con las clases durante un viaje están en la guía «ⓘ Cómo funcionan las cancelaciones», dentro de «Agenda».'),
      helpFaq([
        { q: '¿Cómo le doy acceso a su portal?', a: 'Abre su expediente y toca «Activar portal con enlace»: se genera un enlace para que él mismo cree su contraseña. Si prefieres hacerlo tú, usa «Activar con contraseña».' },
        { q: '¿Puedo tener dos expedientes de la misma persona?', a: 'No conviene: la app te avisa cuando detecta un posible duplicado. Si ya existe, trabaja sobre el que tiene el historial.' },
        { q: '¿Qué pasa con sus cobros si lo pongo Inactivo?', a: 'Se conservan. Lo que no se genera son facturas nuevas mientras esté inactivo.' }
      ]),
      helpGo([{ label: '+ Nuevo cliente', action: 'new-client' }, { label: 'Ir a Clientes', view: 'clients' }])
    ]
  },
  {
    id: 'tarifas', category: 'dia', icon: '🏷️', title: 'Tarifas y planes', summary: 'Los tipos de servicio que puedes ofrecer y cómo crear tus tarifas de referencia.',
    tags: 'tarifa plan precio mensualidad paquete clase suelta rutinas crear modalidad servicio sesiones',
    blocks: [
      helpP('Una **tarifa** (o plan) es una plantilla de lo que vendes. Al asignársela a un cliente, se llena su precio, su cantidad de clases o rutinas y su modalidad.'),
      helpTable(['Tipo', 'Cómo funciona', 'Ejemplo'], [
        ['🗓️ Mensualidad', 'Se renueva cada mes en el día de corte. Incluye una cantidad de clases por mes.', 'Mensualidad 8 clases · $160'],
        ['🎟️ Paquete de sesiones', 'Un número de clases para usar dentro de un plazo. Se renueva a mano.', 'Paquete 12 clases · $300'],
        ['☝️ Sesiones individuales', 'Clase suelta: se cobra cada vez.', 'Clase suelta · $30'],
        ['📲 Rutinas personalizadas', 'Mensualidad de rutinas: sin clases presenciales; cuenta rutinas por ciclo.', 'Rutinas mensuales 7 · $70']
      ]),
      helpSteps('Crear una tarifa', [
        { text: 'Entra a «Facturación» y abre la pestaña «Planes».' },
        { text: 'Toca «+ Crear tarifa».' },
        { text: 'Escribe el nombre y la descripción. Elige la **Modalidad** (Mensualidad, Paquete o Sesiones individuales) y el **Precio (USD)**.' },
        { text: 'En **Servicio incluido** elige Entrenamiento presencial, virtual o **Rutinas personalizadas**. Si eliges rutinas, indica las **Rutinas por mes**.' },
        { text: 'Si es mensualidad o paquete, indica cuántas sesiones incluye (y la vigencia en días si es paquete). Guarda.' }
      ]),
      helpTip('El precio de la tarifa es de **referencia**: al asignarla se copia al cliente, pero lo que se factura lo manda el «Plan de facturación» de cada cliente. Así puedes pactar un monto distinto sin tocar la tarifa.'),
      helpWarn('Cambiar el precio de una tarifa **no** cambia lo que ya pagan tus clientes. Para eso usa «Cambiar monto» en el plan de facturación de cada uno.'),
      helpGo([{ label: 'Crear una tarifa', action: 'new-plan' }, { label: 'Ir a Facturación', view: 'billing' }])
    ]
  },
  {
    id: 'agenda', category: 'dia', icon: '📅', title: 'Agenda y asistencia', summary: 'Agendar clases, repetirlas cada semana, marcar quién entrenó y manejar cancelaciones.',
    tags: 'agenda agendar sesion clase repetir semanal horario fijo marcar cumplio cancelar reprogramar asistencia cumplimiento calendario google',
    blocks: [
      helpP('La **Agenda** muestra tus clases por día, semana o mes. Debajo del calendario ves el día elegido con cada clase y sus botones.'),
      helpSteps('Agendar una clase', [
        { text: 'Toca «+ Agendar sesión».' },
        { text: 'Elige el cliente, la fecha, la hora y la duración.' },
        { text: 'Si siempre entrena el mismo día y hora, marca los días en «Repetir en» y elige «Sin fecha de fin, hasta que deje de entrenar» (o una fecha en **Repetir hasta**): la agenda se va llenando sola.' },
        { text: 'Guarda. La clase aparece en el calendario; te avisamos si choca con otra.' }
      ]),
      helpSteps('Marcar quién entrenó', [
        { text: 'Abre la clase en la agenda y toca «Cumplió» cuando se dé. Cada marca cuenta en su cumplimiento y descuenta una clase de su plan.' },
        { text: 'Si no vino, usa «Cancelar clase» y elige qué pasó (se reprograma, rutina, o se cancela). Más abajo está el resumen.' },
        { text: '«Entrenamientos de hoy» te deja marcar a varias personas de una sola vez.' },
        { text: 'Una clase sin marcar sigue pendiente: la campanita te lo recuerda cuando ya terminó.' }
      ]),
      helpSteps('Cambiar o mover una clase', [
        { text: 'Abre la clase y toca «Editar horario».' },
        { text: 'También puedes mover una clase eligiendo el día nuevo en el calendario.' }
      ]),
      helpP('**Horarios fijos** lista los horarios que se repiten y te deja detenerlos cuando alguien ya no entrena. **Mi horario** es donde dices en qué turnos trabajas, para que la agenda no ofrezca huecos que no tienes.'),
      helpTable(['Si el cliente cancela…', 'Qué pasa'], [
        ['Se reprogramará a otro día', 'No afecta su cumplimiento. La clase nueva descuenta cuando se dé.'],
        ['Propones una rutina en lugar de la clase', 'Si la cumple ese mismo día, cuenta como clase dada. Si no, la clase se da por perdida.'],
        ['Cancela sin reprogramar ni rutina', 'Cuenta como incumplida y se le descuenta una clase de su plan.'],
        ['Cancelas tú', 'No toca su cumplimiento ni su saldo. Puedes reponerla.']
      ]),
      helpNote('La guía completa, con los casos de crédito y de viaje, está en el botón «ⓘ Cómo funcionan las cancelaciones» de la agenda.'),
      helpSteps('Ver el cumplimiento', [
        { text: 'En «Asistencia» eliges el mes (o un rango) y ves el cumplimiento de cada cliente.' },
        { text: 'Con «Informe de asistencia →» comparas hasta cuatro clientes, por ciclo de corte o por rango de fechas, y puedes exportarlo.' },
        { text: 'En el calendario también aparecen marcadas las **rutinas** que tus clientes hacen (con su hora).' }
      ]),
      helpFaq([
        { q: '¿Se pueden agendar clases a alguien con plan de rutinas?', a: 'Hoy no: el plan de rutinas no incluye clases presenciales. Si una persona quiere ambas cosas, mira el tema «Cuando algo no sale».' },
        { q: '¿Se conecta con Google Calendar?', a: 'Sí: en la agenda puedes conectar tu Google Calendar y las clases se sincronizan.' },
        { q: '¿Qué hago con una clase que se me olvidó marcar?', a: 'Ábrela en la agenda y márcala. Hasta que lo hagas aparece como pendiente y la campanita te lo recuerda.' }
      ]),
      helpGo([{ label: '+ Agendar sesión', action: 'new-session' }, { label: 'Ir a Agenda', view: 'calendar' }, { label: 'Guía de cancelaciones', action: 'cancel-guide' }])
    ]
  },
  {
    id: 'rutinas', category: 'rutinas', icon: '🏋️', title: 'Crear y asignar rutinas', summary: 'Armar una rutina con tu catálogo, asignarla a un cliente, enviarla por enlace y revisar si la hizo.',
    tags: 'rutina crear asignar ejercicio catalogo bloque ia fecha limite disponible desde enlace version repetida 30 dias video',
    blocks: [
      helpP('Una **rutina** es una lista de ejercicios con su dosis. La armas una vez y la asignas a quien quieras; el cliente la ve en su portal y puede cronometrarla.'),
      helpSteps('Crear una rutina', [
        { text: 'En «Rutinas» toca «+ Crear rutina».' },
        { text: 'Escribe el título y la descripción, y las sesiones por semana.' },
        { text: 'Agrega ejercicios de tu catálogo: elige tipo, nivel y ejercicio, pon series y repeticiones y toca agregar. Puedes organizarlos en **bloques** (calentamiento, fuerza…).' },
        { text: 'Si quieres un empujón, usa «✦ Proponer con IA»: describe lo que buscas y revisa la propuesta antes de guardar (nunca se guarda sola).' },
        { text: 'Toca «Guardar rutina completa».' }
      ]),
      helpSteps('Asignarla a un cliente', [
        { text: 'En el mismo formulario, elige a la persona en **Asignar a**.' },
        { text: '**Disponible desde** es cuándo empieza a verla (por defecto, hoy). **Fecha límite para cumplirla** es hasta cuándo.' },
        { text: 'Guarda. El cliente la ve en «Mis rutinas» de su portal y recibe el aviso.' }
      ]),
      helpTip('Si ya la tenías guardada sin cliente, ábrela desde «Rutinas», elígele a la persona y fíjale fecha. Para una rutina nueva a partir de otra, usa duplicar y cámbiale lo que necesites.'),
      helpSteps('Enviar por enlace (sin cuenta)', [
        { text: 'Desde la rutina, genera un **enlace temporal**: sirve para alguien que está de viaje o que aún no tiene portal.' },
        { text: 'Compártelo por WhatsApp. Quien lo abre ve la rutina con cronómetro y puede marcar que la terminó.' }
      ]),
      helpP('Si cambias, agregas o quitas un ejercicio de una rutina **ya enviada**, el sistema crea una **versión nueva** sin que el cliente note nada raro. Cambiar series, repeticiones o notas no crea versión.'),
      helpWarn('Si le envías a alguien una rutina que ya recibió hace menos de 30 días, la app te avisa para que no repitas por descuido. Puedes confirmar y enviarla igual.'),
      helpSteps('Ver si la hizo', [
        { text: 'En su expediente, «Rutinas enviadas» muestra cada envío; «Historial de rutinas» muestra cuándo la hizo, el porcentaje y el tiempo.' },
        { text: 'Recibes una notificación cuando empieza o termina una rutina.' }
      ]),
      helpFaq([
        { q: '¿Para qué sirve el catálogo de ejercicios?', a: 'Es tu biblioteca: cada ejercicio puede tener varios videos de demostración que ve el cliente. Lo abres con «Catálogo de ejercicios».' },
        { q: '¿Una rutina puede valer en lugar de una clase?', a: 'Sí: cuando un cliente cancela, puedes proponerle una rutina. Si la cumple el mismo día cuenta como clase dada.' },
        { q: '¿Puede repetir una rutina?', a: 'Si tiene un plan de rutinas o la compró suelta, sí: cada repetición queda registrada con su fecha y hora.' }
      ]),
      helpGo([{ label: '+ Crear rutina', action: 'new-routine' }, { label: 'Ir a Rutinas', view: 'routines' }])
    ]
  },
  {
    id: 'plan-rutinas', category: 'rutinas', icon: '🔁', title: 'Clientes de rutinas (por ciclo)', summary: 'Cómo funciona un plan mensual de rutinas: cupo, ciclo, vencimiento, avisos y seguimiento. Incluye el paso a paso de “7 rutinas por $70”.',
    tags: 'plan rutinas ciclo cupo corte vencen repetir avisos bitacora enviadas hechas cumplimiento 70 siete mensual',
    blocks: [
      helpP('Un plan de rutinas se organiza por **ciclos**: del día de corte hasta el día anterior al siguiente corte. En cada ciclo tú envías el **cupo** de rutinas (por ejemplo, 7) y el cliente las hace; lo que no hizo vence al cerrar el ciclo.'),
      helpSteps('Paso a paso: 7 rutinas mensuales por $70', [
        { text: '**Una sola vez:** en «Facturación» → «Planes» toca «+ Crear tarifa». Nombre “Rutinas mensuales 7”, Modalidad Mensualidad, Precio 70, Servicio incluido **Rutinas personalizadas** y **Rutinas por mes: 7**.' },
        { text: '**Cada cliente nuevo:** «+ Nuevo cliente», elige esa tarifa y su **Día de corte** (usa el día en que empieza). Crea el expediente.' },
        { text: '**Cobro:** en su expediente, en «Plan de facturación», toca «Confirmar concepto» ($70). Luego, en «Facturación» → «Facturas», «+ Nueva factura» (Mensualidad, el cliente como pagador, $70) y «Crear factura». Registra su cobro cuando pague.' },
        { text: 'A partir de ahí **el sistema emite solo** la factura de cada corte. Solo la primera se crea a mano.' },
        { text: '**Rutinas:** con «+ Crear rutina», asígnalas a ese cliente. La fecha límite se ajusta sola al último día del ciclo. Si ya tiene 7 y quieres una más, te pregunta antes.' },
        { text: '**Próximo ciclo:** para dejar rutinas listas, pon como «Disponible desde» el día de su corte; el cliente no las ve hasta entonces.' }
      ]),
      helpTable(['Cuándo', 'Qué recibes'], [
        ['2 días antes del corte', 'Un aviso por cada cliente al que le falten rutinas del ciclo nuevo.'],
        ['1 día antes', 'Otro aviso si sigue incompleto.'],
        ['El día del corte', 'Un aviso si el cliente empieza el ciclo sin ninguna rutina.']
      ]),
      helpP('Lo que el cliente **no** hizo al cerrar el ciclo vence: no se acumula, no se cobra ni se descuenta nada. El ciclo nuevo solo abre con lo que tú le envíes; si no enviaste nada, el cliente ve un mensaje amable y nada del ciclo anterior.'),
      helpP('Mientras el ciclo está vigente, el cliente puede **repetir** sus rutinas las veces que quiera. Cada realización queda con su fecha y hora y cuenta para su seguimiento, aunque supere el cupo.'),
      helpSteps('Seguimiento', [
        { text: 'En su expediente, **«Rutinas del ciclo»** muestra: **enviadas** (las que tú asignaste) y **hechas** (las que él realizó, completas o parciales, con repeticiones). Son números distintos.' },
        { text: 'El **cumplimiento** es hechas ÷ cupo y puede pasar de 100 %. La **calidad** (promedio completado, tiempo, sensación) va aparte.' },
        { text: 'Con los botones ‹ › cambias de ciclo; el calendario de la bitácora marca los días en que entrenó.' },
        { text: 'Debajo hay botones para el **Informe de rutinas** en PDF o CSV.' }
      ]),
      helpTip('Si a un cliente le toca otro número de rutinas, cámbialo en «Editar cliente» → «Rutinas esperadas por ciclo». Si lo dejas vacío usa las de su tarifa.'),
      helpWarn('A un cliente con plan de rutinas no se le agendan clases presenciales. Si una persona quiere rutinas y una clase semanal, mira «Cuando algo no sale».'),
      helpGo([{ label: 'Crear una tarifa', action: 'new-plan' }, { label: '+ Nuevo cliente', action: 'new-client' }, { label: '+ Crear rutina', action: 'new-routine' }])
    ]
  },
  {
    id: 'rutinas-sueltas', category: 'rutinas', icon: '🎟️', title: 'Rutinas sueltas', summary: 'Vender 1 o un grupo de rutinas, con una ventana de “desde cuándo hasta cuándo”, sin cambiar el plan del cliente.',
    tags: 'rutina suelta bono vender ventana desde hasta factura cortesia anular cupo',
    blocks: [
      helpP('Funciona como una clase suelta, pero con rutinas: Eileen vende **1 o varias rutinas**, define **desde cuándo hasta cuándo** están disponibles y se factura como una venta puntual. No cambia el plan del cliente y puede comprarla cualquier cliente.'),
      helpSteps('Vender rutinas sueltas', [
        { text: 'Abre el expediente del cliente y busca la sección **Rutinas sueltas**.' },
        { text: 'Toca «Vender rutinas sueltas».' },
        { text: 'Escribe la **Cantidad de rutinas**, el **Precio por rutina (USD)** y las fechas **Disponibles desde / hasta**. Verás el total.' },
        { text: 'Deja marcada «Generar la factura de rutina suelta» (si el precio es 0, es una cortesía y no se factura) y toca «Registrar venta».' }
      ]),
      helpSteps('Asignar las rutinas de esa venta', [
        { text: 'En la tarjeta de la venta toca «Asignar rutina». Se abre el editor con el cliente y la venta ya elegidos y la ventana puesta.' },
        { text: 'También puedes hacerlo desde «+ Crear rutina»: si el cliente tiene ventas vigentes aparece **Con cargo a rutinas sueltas**.' },
        { text: 'Las rutinas empiezan cuando abre la ventana y valen hasta su último día. El cupo es lo que vendiste; si te pasas, te pregunta.' }
      ]),
      helpP('Mientras la ventana está vigente, el cliente ve sus rutinas y puede repetirlas. Su portal muestra «Mis rutinas sueltas» con cuántas lleva, sin importes.'),
      helpSteps('Cambiar o anular', [
        { text: '«Cambiar ventana» amplía o recorta las fechas y mueve la fecha límite de las rutinas ya enviadas. La factura no cambia: si hace falta, anúlala y emite otra.' },
        { text: '«Anular» deja la venta sin efecto y las rutinas dejan de estar disponibles. Si anulas la factura de la venta, también se anula la venta.' }
      ]),
      helpTip('Si la persona ya paga una mensualidad que incluye rutinas, puedes vender un bono con precio 0 cada ciclo solo para llevar la cuenta y la ventana.'),
      helpGo([{ label: 'Ir a Clientes', view: 'clients' }])
    ]
  },
  {
    id: 'facturacion', category: 'dinero', icon: '💳', title: 'Cobros y facturación', summary: 'El plan de facturación, las facturas automáticas, cobrar, corregir y anular. Con recetas para los casos de todos los días.',
    tags: 'factura cobro cobrar pagar pago plan facturacion automatica anular corregir monto reparto parcial yappy efectivo transferencia estado cuenta cuentas por cobrar',
    blocks: [
      helpP('El dinero se maneja en «Facturación», con estas pestañas:'),
      helpTable(['Pestaña', 'Para qué sirve'], [
        ['«Facturas»', 'Todas las facturas: crear, ver, registrar cobro, anular, corregir reparto.'],
        ['«Cobros»', 'Los pagos recibidos. Con «+ Registrar cobro» anotas uno y eliges a qué facturas se aplica.'],
        ['«Próximas»', 'Lo que el sistema emitirá solo en los próximos días.'],
        ['«Reportes»', 'Cuentas por cobrar, estado de cuenta por pagador, cobrado por mes y método, morosidad, pagos sin aplicar y bitácora de cambios.'],
        ['«Finanzas» y «Gastos»', 'Tendencia de tus ingresos mes a mes y el registro de tus gastos.'],
        ['«Planes»', 'Tus tarifas de referencia.'],
        ['«Historial Zoho»', 'Consulta de lo que se migró del sistema anterior.']
      ]),
      helpSteps('Cómo se cobra una mensualidad', [
        { text: 'Cada cliente tiene su **Plan de facturación** en el expediente: ahí se dice qué se le cobra, cuánto y quién paga. Si no hay ninguno, toca «Confirmar concepto» en la propuesta que sale del expediente.' },
        { text: '**La primera factura** se crea a mano en «Facturas» → «+ Nueva factura» (Pagador, Tipo Mensualidad, Inicio del ciclo, una línea por persona) y «Crear factura». El sistema necesita una factura de referencia para continuar.' },
        { text: 'Desde el **siguiente corte** las facturas se emiten solas, el mismo día del corte, y vencen al día siguiente. En «Próximas» ves cuándo saldrá cada una.' },
        { text: 'Cuando el cliente paga, toca «Registrar cobro» en su factura: elige método (efectivo, Yappy, transferencia…), fecha y monto.' }
      ]),
      helpP('Un cobro puede ser **parcial**: la factura queda “Pago parcial” con su saldo y el cliente puede seguir entrenando. Cuando completa, pasa a “Pagada”.'),
      helpTable(['Estado', 'Significa'], [
        ['Pago pendiente', 'Se emitió y no se ha cobrado.'],
        ['Pago parcial', 'Se cobró una parte; queda saldo.'],
        ['Pagada', 'Cobrada por completo.'],
        ['Anulada', 'Quedó sin efecto (con su motivo). No se borra.']
      ]),
      helpSteps('Receta: cambiar el monto de un cliente', [
        { text: 'En su expediente, «Plan de facturación», busca la línea del cliente.' },
        { text: '**«Cambiar monto»** cuando el precio nuevo rige **desde una fecha** (la línea vieja termina el día anterior).' },
        { text: '**«Corregir monto»** cuando solo fue un error de digitación: cambia el importe en su sitio.' }
      ]),
      helpSteps('Receta: una factura salió mal', [
        { text: 'Si es solo el **reparto** entre personas de una familia y el total es el mismo, usa «Corregir reparto».' },
        { text: 'Si el monto o el ciclo están mal, toca «Anular» y escribe el motivo. Las automáticas se vuelven a emitir solas con lo vigente; si necesitas un importe distinto, créala a mano.' },
        { text: 'Una factura con cobros aplicados no se anula hasta revertir esos cobros.' }
      ]),
      helpSteps('Receta: cambiar el día de corte de un cliente', [
        { text: 'Cambia el corte en «Editar plan y corte».' },
        { text: 'El ciclo que ya está en curso no se prorratea solo: si necesitas cobrar un tramo intermedio, anula la factura del ciclo en curso y crea una **factura manual** con el ciclo exacto y el importe que acordaron.' },
        { text: 'Esa factura manual queda como referencia y el sistema continúa solo desde su fecha final con el corte nuevo.' }
      ]),
      helpWarn('Al crear una factura a mano que tapa un ciclo que el sistema iba a emitir, desmarca antes «Facturación automática» de esa línea (y vuelve a marcarla después); si no, el sistema puede emitir la completa antes de que termines.'),
      helpTable(['Tipo de factura', 'Cuándo se usa'], [
        ['Mensualidad', 'El cobro mensual de un plan, por ciclo.'],
        ['A crédito', 'Clases dadas, cobradas al final del mes (clientes que entrenan y pagan después).'],
        ['Paquete', 'Un paquete de clases con su vigencia.'],
        ['Clase suelta', 'Una clase cobrada una sola vez.'],
        ['Rutina suelta', 'Rutinas vendidas con su ventana de fechas.'],
        ['Manual', 'Cualquier otro cobro puntual.']
      ]),
      helpFaq([
        { q: '¿Qué es “anticipado” y “a crédito”?', a: 'Anticipado: el cliente paga al inicio del ciclo. A crédito: entrena y paga al final, solo por lo que se dio. Se elige en «Editar plan y corte».' },
        { q: '¿Cómo veo cuánto debe un cliente?', a: 'En «Facturación» → «Reportes» elige «Estado de cuenta por pagador» para uno, o «Cuentas por cobrar» para todos.' },
        { q: '¿Una cotización se convierte en factura?', a: 'No. Las cotizaciones son informativas. Si la persona continúa, el cobro sigue el camino normal de arriba.' }
      ]),
      helpGo([{ label: 'Ir a Facturación', view: 'billing' }])
    ]
  },
  {
    id: 'cotizaciones', category: 'dinero', icon: '🧾', title: 'Cotizaciones', summary: 'Hacer una propuesta con tus precios y condiciones, compartirla por WhatsApp o enlace y saber si la vieron.',
    tags: 'cotizacion cotizar propuesta clausulas condiciones avisos compartir whatsapp pdf enlace presupuesto informativa',
    blocks: [
      helpP('Una **cotización** es una propuesta informativa para un cliente (o para alguien que aún no lo es). No es una factura ni un contrato y no se convierte en factura. Lleva los precios, una vigencia y las **cláusulas** que tú quieras aplicar, como avisos.'),
      helpSteps('Hacer una cotización', [
        { text: 'Entra a «Cotizaciones» y toca «+ Nueva cotización». En el celular, está en el botón de la hoja 📄 arriba.' },
        { text: '**1 · ¿Para quién es?** Elige «Un cliente» o «Alguien nuevo» (nombre y teléfono). Define por cuánto tiempo vale: 7, 15 o 30 días, o una fecha.' },
        { text: '**2 · ¿Qué le ofreces?** Toca una de tus tarifas para agregarla, o «+ Agregar línea libre». Ajusta cantidades y precios. Si quieres, «Agregar un descuento» en % o en dólares.' },
        { text: '**3 · Condiciones y avisos.** Marca las cláusulas que quieres mostrar. Cinco vienen marcadas por defecto. También puedes escribir una solo para esta cotización.' },
        { text: '**4 · Tu mensaje.** Un saludo cálido y, si quieres, una nota final.' },
        { text: 'Toca «Vista previa» para verla tal como la verá tu cliente y «Guardar» o «Guardar y compartir».' }
      ]),
      helpSteps('Compartirla', [
        { text: 'En «Compartir» eliges: **WhatsApp** (se abre con el mensaje y el enlace listos), **Copiar** el enlace, **Descargar PDF** o **Correo**.' },
        { text: 'El enlace abre una página bonita con la cotización, sin que el cliente necesite cuenta. Al compartirla queda marcada como **Enviada**.' },
        { text: 'Cuando la abren, te llega una notificación y la tarjeta dice “La abrió hace…”.' }
      ]),
      helpSteps('Mis cláusulas', [
        { text: 'Toca «Mis cláusulas» para ver tu biblioteca. Trae 14 textos de ejemplo (pagos, cancelaciones, salud, datos personales…).' },
        { text: 'Edítalas a tu manera, agrega nuevas con «+ Nueva cláusula», elige un icono y marca cuáles vienen marcadas siempre.' },
        { text: 'Puedes usar palabras que se llenan solas: {{cliente}}, {{vigencia}}, {{total}}, {{emision}} y {{numero}}.' },
        { text: 'Editar una cláusula **no cambia** las cotizaciones que ya enviaste: cada una guarda una copia del texto.' }
      ]),
      helpTable(['Estado', 'Significa'], [
        ['✏️ Borrador', 'La estás armando; nadie la ha visto.'],
        ['📤 Enviada', 'Ya compartiste el enlace.'],
        ['✅ Aceptada', 'Tú la marcaste como aceptada.'],
        ['🚫 No continuó', 'La persona decidió no seguir.'],
        ['⌛ Vencida', 'Pasó su fecha de vigencia sin respuesta.']
      ]),
      helpTip('En el menú «⋯» de cada cotización puedes duplicarla, reabrirla, marcarla y, si era una persona nueva, tocar «Crear expediente con estos datos» para no volver a escribirlos.'),
      helpNote('Los textos de ejemplo son un punto de partida. Si quieres asegurarte de que cumplen con lo que ofreces y con la ley, revísalos con tu asesor legal.'),
      helpGo([{ label: 'Ir a Cotizaciones', view: 'quotes' }])
    ]
  },
  {
    id: 'informes', category: 'dinero', icon: '📈', title: 'Informes', summary: 'Qué informes puedes sacar, dónde están y qué significa cada cifra.',
    tags: 'informe reporte cumplimiento asistencia pdf csv estado cuenta cuentas por cobrar mensual rutinas',
    blocks: [
      helpTable(['Informe', 'Dónde', 'Qué muestra'], [
        ['Asistencia', '«Asistencia» o «Informe de asistencia →»', 'Cumplimiento de hasta 4 clientes por ciclo o rango, mes a mes. Se exporta a CSV.'],
        ['Cumplimiento (PDF)', 'Expediente del cliente', 'Evolución mes a mes de sus clases.'],
        ['Informe de rutinas', 'Expediente (Rutinas del ciclo) y el informe general', 'Enviadas, hechas, repeticiones, cumplimiento y calidad por ciclo. PDF y CSV.'],
        ['Estado de cuenta por pagador', '«Facturación» → «Reportes»', 'Lo facturado, pagado y pendiente de un pagador.'],
        ['Cuentas por cobrar', '«Facturación» → «Reportes»', 'Quién debe y desde cuándo, por antigüedad.'],
        ['Cobrado, morosidad y pagos sin aplicar', '«Facturación» → «Reportes»', 'Lo cobrado por mes y método, quién está atrasado y los pagos que faltan por aplicar.']
      ]),
      helpP('Tus clientes también tienen **Mis informes** en su portal: su asistencia, su peso y su estado de cuenta, para que los descarguen ellos mismos.'),
      helpSteps('Cómo leer el cumplimiento de clases', [
        { text: 'Cuenta las clases **cumplidas** y las **sin hacer**; el cumplimiento es el porcentaje de cumplidas.' },
        { text: 'Las clases pendientes, futuras, pausadas y canceladas por ti no entran en la cuenta.' }
      ]),
      helpSteps('Cómo leer el informe de rutinas', [
        { text: '**Enviadas:** rutinas distintas que asignaste en el ciclo.' },
        { text: '**Hechas:** ejecuciones cerradas, completas o parciales, incluidas las repeticiones.' },
        { text: '**Cumplimiento:** hechas ÷ cupo. Puede pasar de 100 %.' },
        { text: 'Un ciclo en el que no enviaste nada dice “Sin enviar” y no cuenta como incumplimiento del cliente.' }
      ]),
      helpGo([{ label: 'Informe de asistencia', action: 'compliance-report' }, { label: 'Ir a Asistencia', view: 'attendance' }])
    ]
  },
  {
    id: 'contratos', category: 'dinero', icon: '📝', title: 'Contratos', summary: 'Generar el contrato de un cliente, enviarlo a firmar y guardarlo firmado.',
    tags: 'contrato firma firmar legal mensualidad paquete rutinas credito portal papel escaneado',
    blocks: [
      helpP('Los contratos son **informativos**: dejan por escrito lo que acordaron (clases o rutinas, precio, corte, reprogramaciones) y **no cambian** su facturación, sus facturas ni su saldo. Hay una plantilla para mensualidad, paquete, rutinas y crédito; se elige sola según su plan.'),
      helpSteps('Generar y enviar', [
        { text: 'Abre el expediente del cliente y busca la sección **Contrato**; toca «Generar contrato».' },
        { text: 'Revisa los datos que el contrato toma del plan. Si falta algo, te dice qué completar; el contrato avisa si lo acordado no coincide con lo que se le cobra.' },
        { text: 'Puedes guardarlo como borrador o **enviarlo**: el cliente lo ve en su portal y lo firma ahí.' }
      ]),
      helpSteps('Otras formas de firmar', [
        { text: '**En persona:** desde un borrador, el cliente firma con el dedo o con Apple Pencil en tu aparato.' },
        { text: '**En papel:** firma el documento impreso, lo escaneas y lo subes al expediente.' }
      ]),
      helpSteps('Tu firma sale sola', [
        { text: 'Guárdala **una sola vez**: en la sección Contrato del expediente (o al generar un contrato) toca «Guardar mi firma ahora», fírmala con el dedo o el Apple Pencil, o sube una foto de tu firma.' },
        { text: 'Desde entonces aparece en el lugar de «Eileen» en todos los contratos: en el borrador, al enviarlo y al firmarlo. El cliente es **el único que firma**.' },
        { text: 'Si no la has guardado, la app te lo avisa en el contrato. Si lo enviaste antes de guardarla, no pasa nada: al firmarlo el cliente se usa la firma que tengas en ese momento.' },
        { text: 'Para cambiarla, toca «Cambiar mi firma» en esa misma sección. Los contratos que ya están firmados no se modifican.' }
      ]),
      helpP('Un contrato **firmado no se puede cambiar**. Si algo cambia, se genera uno nuevo. El documento firmado queda en el expediente y en los documentos del cliente.'),
      helpNote('Tus datos legales (nombre, identificación, domicilio y firma) se escriben una vez en «Ajustes de la cuenta». El texto de las cláusulas está pendiente de revisión jurídica: es una plantilla de trabajo.'),
      helpFaq([
        { q: '¿El contrato reemplaza a la factura?', a: 'No. Es un comprobante interno de servicios. Las facturas siguen su propio camino en «Facturación».' },
        { q: '¿Qué dice de las reprogramaciones?', a: 'Que se hacen de lunes a viernes en el horario que tú definiste (con tope a las 5 p. m.) y con 24 horas de aviso para cambios de disponibilidad.' }
      ]),
      helpGo([{ label: 'Ir a Clientes', view: 'clients' }])
    ]
  },
  {
    id: 'portal', category: 'dia', icon: '📲', title: 'El portal de tus clientes', summary: 'Cómo darles acceso y qué ven y pueden hacer.',
    tags: 'portal cliente acceso enlace contrasena rutinas agenda pagos informes instalar notificaciones',
    blocks: [
      helpP('El **portal** es la parte de la app que ve cada cliente con su propia cuenta: su progreso, sus rutinas, su agenda, sus pagos y sus informes.'),
      helpSteps('Darle acceso', [
        { text: 'En su expediente toca «Activar portal con enlace» y comparte el enlace por WhatsApp. Él elige su contraseña.' },
        { text: 'Si prefieres, usa «Activar con contraseña» para ponérsela tú (y «Poner contraseña a mano» si la olvidó).' },
        { text: 'Pídele que instale la app en su teléfono para recibir avisos: al crear su contraseña le sale una guía paso a paso.' }
      ]),
      helpGo([{ label: '📲 Guía para instalar la app', topic: 'instalar-app' }]),
      helpTable(['Pestaña del portal', 'Qué ve'], [
        ['Mi progreso', 'Su cumplimiento, sus mediciones y su peso.'],
        ['Mis rutinas', 'Las rutinas vigentes con cronómetro; si tiene plan de rutinas, su ciclo; y sus rutinas sueltas.'],
        ['Mi agenda', 'Sus clases y los horarios libres para pedir cambios.'],
        ['Facturación', 'Lo que ha pagado y lo pendiente.'],
        ['Mis informes', 'Descargas de asistencia, peso, estado de cuenta e informe de rutinas.']
      ]),
      helpP('Si no quieres que cree cuenta, puedes enviarle una **rutina por enlace**: se abre sin iniciar sesión.'),
      helpTip('Si el cliente dice que no ve su rutina, revisa si ya venció, si todavía no empieza (“Disponible desde”) o si su ciclo ya cerró. Hay más en «Cuando algo no sale».'),
      helpGo([{ label: 'Ir a Clientes', view: 'clients' }])
    ]
  },
  {
    id: 'avisos', category: 'dia', icon: '🔔', title: 'Avisos y notificaciones', summary: 'Qué te avisa la app, cómo activar las notificaciones y cómo probarlas.',
    tags: 'aviso notificacion campanita push recordatorio activar probar iphone horas anticipacion',
    blocks: [
      helpP('La **campanita** 🔔 junta lo que necesita tu atención. Las notificaciones push llegan además al teléfono aunque no tengas la app abierta.'),
      helpSteps('Activar las notificaciones', [
        { text: 'Toca la campanita y marca «Notificaciones push en este dispositivo». El navegador te pedirá permiso.' },
        { text: 'Hazlo en **cada** teléfono o computadora donde quieras recibirlas. En iPhone solo funcionan con la app instalada en la pantalla de inicio.' },
        { text: 'Toca «Enviar notificación de prueba» para comprobar que llegan.' },
        { text: 'Ajusta con cuántas horas avisarte de una sesión y con cuántos días de un pago.' }
      ]),
      helpTable(['Te avisa cuando…', 'Detalle'], [
        ['📅 Se acerca una sesión', 'Con las horas de anticipación que elijas.'],
        ['💳 Hay un pago por vencer o atrasado', 'Para que no se te pase cobrar.'],
        ['✅ Falta marcar una clase', 'Cuando ya terminó y nadie dijo si se dio.'],
        ['⏸️ Termina una pausa', 'Dos días antes.'],
        ['🏋️ Un cliente empieza, termina o deja vencer una rutina', 'Con la rutina y el tiempo que tardó.'],
        ['🔁 Un cliente de rutinas necesita sus rutinas del ciclo nuevo', '2 días antes, 1 día antes y el día del corte.'],
        ['🧾 Abrieron una cotización', 'Con cuántas veces la vieron.'],
        ['🎂 Un cliente cumple años', '2 días antes (a las 8:00 de la mañana) y se queda en la campanita hasta el día del cumpleaños. Con un botón para felicitarle por WhatsApp.'],
        ['✈️ Un viaje empieza sin rutina enviada', 'Para que prepares su enlace.'],
        ['📝 Un cliente firma un contrato', 'Cuando lo firma en el portal.']
      ]),
      helpTip('Para que te avisemos del cumpleaños de un cliente, guarda su **fecha de nacimiento** en su expediente (la que ya pides para el contrato). Verás los próximos 30 días en la tarjeta «Próximos cumpleaños» del Resumen.'),
      helpFaq([
        { q: 'No me llegan las notificaciones.', a: 'Revisa que estén activadas en ese aparato, que hayas dado el permiso al navegador y que, en iPhone, la app esté instalada en la pantalla de inicio. Usa «Enviar notificación de prueba»; si no llega, desactiva y vuelve a activar.' },
        { q: '¿Por qué la campanita muestra avisos que ya atendí?', a: 'Algunos son informativos y se quitan solos: por ejemplo, el de cotización vista desaparece a las 48 horas, y el de rutinas por enviar cuando ya las envías.' }
      ])
    ]
  },
  {
    id: 'si-algo-no-sale', category: 'apoyo', icon: '🛟', title: 'Cuando algo no sale', summary: 'Soluciones rápidas a las dudas más comunes.',
    tags: 'problema error no funciona actualizar app vieja no ve rutina no se agenda factura duplicada clase presencial rutinas viaje pausa contrasena',
    blocks: [
      helpP('Aquí están las situaciones que más se preguntan, con lo que normalmente lo resuelve.'),
      helpFaq([
        { q: 'La app se ve vieja o le falta algo nuevo.', a: 'Ciérrala por completo y ábrela de nuevo. Si sigue igual, abre la dirección de la app agregando /refresh.html al final y vuelve a entrar. Arriba, la etiqueta “PWA v…” te dice qué versión tienes.' },
        { q: 'No puedo agendar una clase a un cliente.', a: 'Revisa su estado: un cliente en pausa o inactivo no se agenda, y uno con plan de rutinas no tiene clases presenciales. También un cliente demo solo recibe rutinas.' },
        { q: 'Un cliente quiere rutinas y además una clase presencial a la semana.', a: 'Hoy se maneja como un cliente **presencial** que recibe rutinas: crea una tarifa “Presencial semanal + rutinas” (mensualidad, servicio presencial, 4 sesiones, el precio combinado), agéndale la clase con «Repetir en» (el día de la semana) y asígnale las rutinas como a cualquier cliente. Si quieres llevar la cuenta de las rutinas, véndele cada ciclo un bono de rutinas sueltas con precio 0.' },
        { q: 'El cliente no ve su rutina en el portal.', a: 'Las causas habituales: ya pasó su fecha límite, todavía no llega su “Disponible desde”, su ciclo ya cerró (si tiene plan de rutinas) o la rutina quedó sin asignar. Ábrela en «Rutinas» y revisa a quién y con qué fechas está asignada.' },
        { q: 'Anulé una factura y apareció otra igual.', a: 'Es lo esperado en las facturas automáticas: el sistema vuelve a emitir la del ciclo con lo vigente. Si necesitas otro importe, corrige el monto en el plan de facturación o crea una factura manual.' },
        { q: 'Quiero cobrarle distinto un mes.', a: 'Crea la factura a mano para ese ciclo, o usa «Cambiar monto» con la fecha desde la que rige el precio nuevo.' },
        { q: 'Un cliente se pausa o se va unos meses.', a: 'Ponlo «En pausa» (o Inactivo) en «Editar contacto». Se conservan su historial y su saldo; solo dejan de generarse facturas nuevas.' },
        { q: 'El cliente olvidó su contraseña.', a: 'En su expediente usa «Enviar enlace de acceso» o «Poner contraseña a mano».' },
        { q: 'Una rutina me pidió confirmar una repetición.', a: 'Es el aviso de que se la enviaste hace menos de 30 días. Confirma si fue a propósito.' },
        { q: 'Me equivoqué al crear un cliente.', a: 'Si es un duplicado o un error, usa «Eliminar cliente» en su expediente. Si es alguien real que dejó de venir, mejor ponlo Inactivo.' }
      ]),
      helpNote('Si algo no está aquí, anota qué hiciste, qué esperabas y qué viste (una captura ayuda mucho) y compártelo con quien te da soporte.')
    ]
  },
  {
    id: 'glosario', category: 'apoyo', icon: '📖', title: 'Glosario', summary: 'Las palabras que usa la app, explicadas en simple.',
    tags: 'glosario palabras significa definicion ciclo corte cupo enviadas hechas bono pagador beneficiario anticipado credito saldo demo',
    blocks: [
      helpTable(['Palabra', 'Qué es'], [
        ['Corte (día de corte)', 'El día del mes en que se le cobra al cliente y empieza su ciclo.'],
        ['Ciclo', 'Del día de corte hasta el día anterior al siguiente corte.'],
        ['Cupo', 'Cuántas rutinas debes enviarle en cada ciclo (en un plan de rutinas).'],
        ['Enviadas', 'Rutinas distintas que asignaste a un cliente en el ciclo.'],
        ['Hechas', 'Veces que el cliente realizó una rutina, completa o parcial, repeticiones incluidas.'],
        ['Cumplimiento', 'En clases: cumplidas entre las que debían darse. En rutinas: hechas ÷ cupo.'],
        ['Repetición', 'Hacer otra vez una rutina dentro de su vigencia; queda registrada con su hora.'],
        ['Plan de facturación', 'Lo que se le cobra a cada persona, cuánto y desde cuándo.'],
        ['Pagador / beneficiario', 'Quien paga la factura y las personas a las que corresponde cada línea (familias).'],
        ['Anticipado / a crédito', 'Pagar al inicio del ciclo, o entrenar y pagar al final por lo dado.'],
        ['Saldo de clases', 'Las clases que le quedan a un cliente de su mensualidad o paquete.'],
        ['Factura de referencia', 'La última factura de un cliente: desde ella el sistema calcula el siguiente ciclo.'],
        ['Bono (rutinas sueltas)', 'Una venta de 1 o varias rutinas con una ventana de fechas.'],
        ['Cláusula', 'Un aviso o condición que puedes poner en una cotización.'],
        ['Cliente demo', 'Alguien que prueba el servicio con rutinas gratis, sin clases ni cobros.'],
        ['Portal', 'La parte de la app que ve cada cliente con su cuenta.'],
        ['Expediente', 'La ficha completa de un cliente.']
      ])
    ]
  }
];

// ── Interfaz ─────────────────────────────────────────────────────────────────────────────────────────────────────
const helpState = { topic: null, query: '' };
const helpViewForTopic = { dashboard: 'empezar', clients: 'clientes', calendar: 'agenda', routines: 'rutinas', attendance: 'informes', billing: 'facturacion', quotes: 'cotizaciones', help: 'empezar' };
const helpFold = text => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Convierte **negrita**, «etiquetas de pantalla» y {{variables}} en HTML seguro.
function helpRich(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/«([^»]+)»/g, '<b class="help-ui">$1</b>')
    .replace(/\{\{([a-z]+)\}\}/g, '<code>{{$1}}</code>');
}
const helpPlain = text => String(text || '').replace(/\*\*/g, '').replace(/[«»]/g, '');
const helpBlockText = block => [block.text, block.title, ...(block.items || []).map(item => (typeof item === 'string' ? item : [item.text, item.q, item.a].join(' '))), ...(block.head || []), ...(block.rows || []).flat()].filter(Boolean).join(' ');
const helpTopicText = topic => helpFold(helpPlain([topic.title, topic.summary, topic.tags, ...topic.blocks.map(helpBlockText)].join(' ')));

function helpBlockMarkup(block, index, topicId) {
  if (block.t === 'p') return `<p class="help-p">${helpRich(block.text)}</p>`;
  if (block.t === 'tip') return `<aside class="help-callout tip"><span aria-hidden="true">💡</span><p>${helpRich(block.text)}</p></aside>`;
  if (block.t === 'warn') return `<aside class="help-callout warn"><span aria-hidden="true">⚠️</span><p>${helpRich(block.text)}</p></aside>`;
  if (block.t === 'note') return `<aside class="help-callout note"><span aria-hidden="true">ℹ️</span><p>${helpRich(block.text)}</p></aside>`;
  if (block.t === 'steps') return `<section class="help-steps" id="help-${topicId}-${index}"><h3>${helpRich(block.title)}</h3><ol>${block.items.map(item => `<li>${helpRich(item.text)}</li>`).join('')}</ol></section>`;
  if (block.t === 'faq') return `<section class="help-faq">${block.items.map(item => `<details><summary>${helpRich(item.q)}</summary><p>${helpRich(item.a)}</p></details>`).join('')}</section>`;
  if (block.t === 'table') return `<div class="help-table-wrap"><table class="help-table"><thead><tr>${block.head.map(cell => `<th>${helpRich(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map((cell, i) => `<td data-label="${escapeHtml(helpPlain(block.head[i] || ''))}">${helpRich(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (block.t === 'go') return `<div class="help-go">${block.items.map(item => `<button type="button" class="secondary"${item.action ? ` data-action="${item.action}"` : item.topic ? ` data-help-open="${item.topic}"` : ` data-view-go="${item.view}"`}>${escapeHtml(item.label)}${item.hint ? `<small>${escapeHtml(item.hint)}</small>` : ''}</button>`).join('')}</div>`;
  return '';
}

function renderHelp() {
  const root = document.getElementById('help-root'); if (!root) return;
  const topic = helpTopics.find(item => item.id === helpState.topic);
  if (topic) { renderHelpTopic(root, topic); return; }
  const needle = helpFold(helpState.query.trim());
  const found = needle ? helpTopics.filter(item => helpTopicText(item).includes(needle)) : helpTopics;
  const quick = [['💳', '¿Cómo cobro a un cliente?', 'facturacion'], ['🏋️', '¿Cómo asigno una rutina?', 'rutinas'], ['📅', '¿Cómo agendo una clase?', 'agenda'], ['🧾', '¿Cómo hago una cotización?', 'cotizaciones']];
  root.innerHTML = `<section class="help-hero"><div><p class="eyebrow">CENTRO DE AYUDA</p><h2>¿En qué te ayudo? 💜</h2><p>Guías paso a paso, escritas para tu día a día. Busca una palabra o elige un tema.</p></div>
      <label class="help-search"><span aria-hidden="true">🔍</span><input type="search" id="help-search" placeholder="Busca: cobrar, rutina, contrato, corte…" value="${escapeHtml(helpState.query)}" autocomplete="off" /></label>
      ${needle ? '' : `<div class="help-quick">${quick.map(([icon, text, id]) => `<button type="button" class="help-quick-btn" data-help-open="${id}"><span aria-hidden="true">${icon}</span>${text}</button>`).join('')}</div>`}</section>
    ${needle ? `<p class="help-count">${found.length ? `${found.length} tema${found.length === 1 ? '' : 's'} con “${escapeHtml(helpState.query.trim())}”` : ''}</p>` : ''}
    ${found.length ? (needle ? `<div class="help-grid">${found.map(helpCardMarkup).join('')}</div>` : helpCategories.map(category => {
      const list = found.filter(item => item.category === category.id);
      return list.length ? `<h3 class="help-cat"><span aria-hidden="true">${category.icon}</span>${category.title}</h3><div class="help-grid">${list.map(helpCardMarkup).join('')}</div>` : '';
    }).join('')) : `<div class="help-empty"><span aria-hidden="true">🤔</span><h3>No encontré nada con “${escapeHtml(helpState.query.trim())}”</h3><p>Prueba con otra palabra, o mira la lista completa de temas.</p><button type="button" class="secondary" id="help-clear">Ver todos los temas</button></div>`}
    <p class="help-foot">Versión de la aplicación: <b>v${APP_VERSION}</b> · Si algo no está aquí, cuéntaselo a quien te da soporte con una captura.</p>`;
  bindHelp(root);
}

const helpCardMarkup = topic => `<button type="button" class="help-card" data-help-open="${topic.id}"><span class="help-card-icon" aria-hidden="true">${topic.icon}</span><span class="help-card-body"><b>${escapeHtml(topic.title)}</b><small>${escapeHtml(topic.summary)}</small></span><span class="help-card-arrow" aria-hidden="true">›</span></button>`;

function renderHelpTopic(root, topic) {
  const index = helpTopics.indexOf(topic); const next = helpTopics[index + 1]; const previous = helpTopics[index - 1];
  const toc = topic.blocks.map((block, i) => (block.t === 'steps' ? `<a href="#help-${topic.id}-${i}" data-help-jump="help-${topic.id}-${i}">${helpRich(block.title)}</a>` : '')).filter(Boolean);
  root.innerHTML = `<button type="button" class="secondary help-back" data-help-back>← Todos los temas</button>
    <header class="help-topic-head"><span class="help-topic-icon" aria-hidden="true">${topic.icon}</span><div><p class="eyebrow">${(helpCategories.find(c => c.id === topic.category) || {}).title || 'AYUDA'}</p><h2>${escapeHtml(topic.title)}</h2><p>${escapeHtml(topic.summary)}</p></div></header>
    ${toc.length > 1 ? `<nav class="help-toc" aria-label="En este tema"><b>En este tema</b>${toc.join('')}</nav>` : ''}
    <article class="help-article">${topic.blocks.map((block, i) => helpBlockMarkup(block, i, topic.id)).join('')}</article>
    <footer class="help-pager">${previous ? `<button type="button" class="secondary" data-help-open="${previous.id}">← ${escapeHtml(previous.title)}</button>` : '<span></span>'}${next ? `<button type="button" class="secondary" data-help-open="${next.id}">${escapeHtml(next.title)} →</button>` : '<span></span>'}</footer>`;
  bindHelp(root); window.scrollTo(0, 0);
}

function bindHelp(root) {
  root.querySelectorAll('[data-help-open]').forEach(button => button.onclick = () => openHelp(button.dataset.helpOpen));
  root.querySelector('[data-help-back]')?.addEventListener('click', () => { helpState.topic = null; renderHelp(); window.scrollTo(0, 0); });
  root.querySelector('#help-clear')?.addEventListener('click', () => { helpState.query = ''; renderHelp(); });
  root.querySelectorAll('[data-help-jump]').forEach(link => link.onclick = event => { event.preventDefault(); document.getElementById(link.dataset.helpJump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const input = root.querySelector('#help-search');
  if (input) { let timer = null; input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { helpState.query = input.value; renderHelp(); const again = document.getElementById('help-search'); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }, 200); }); }
}

// Abre un tema concreto (o la portada si no se indica).
function openHelp(topicId = null) {
  helpState.topic = topicId && helpTopics.some(item => item.id === topicId) ? topicId : null;
  if (typeof modal !== 'undefined' && modal.open) modal.close();
  navigate('help'); renderHelp();
}

// Un botoncito “ⓘ Ayuda” en la cabecera de cada pantalla lleva al tema que le corresponde.
function installHelpChips() {
  for (const [viewId, topicId] of Object.entries(helpViewForTopic)) {
    if (viewId === 'help' || viewId === 'dashboard') continue;
    const heading = document.querySelector(`#${viewId} .section-heading`) || document.querySelector(`#${viewId} .qt-head`);
    if (!heading || heading.querySelector('.help-chip')) continue;
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'help-chip'; chip.dataset.helpTopic = topicId; chip.textContent = 'ⓘ Ayuda'; chip.setAttribute('aria-label', 'Ayuda sobre esta pantalla');
    heading.append(chip);
  }
}
document.addEventListener('click', event => {
  const chip = event.target.closest?.('[data-help-topic]'); if (chip) { openHelp(chip.dataset.helpTopic); return; }
  const go = event.target.closest?.('#help-root [data-view-go]'); if (go) navigate(go.dataset.viewGo);
});
installHelpChips();

// ── Guía rápida para el cliente (en su portal) ───────────────────────────────────────────────────────────────────
const portalGuideItems = [
  ['🏋️', '¿Cómo hago mi rutina?', 'Entra a «Mis rutinas», abre la rutina y toca ▶ para iniciar el cronómetro. Marca cada ejercicio cuando lo termines y, al final, toca el botón de terminar. Eileen recibe el aviso.'],
  ['🔁', '¿Puedo repetir una rutina?', 'Si tienes un plan de rutinas o compraste rutinas sueltas, sí: puedes repetirlas cuantas veces quieras mientras estén vigentes. Cada vez queda registrada con su fecha y hora.'],
  ['⏳', '¿Hasta cuándo puedo hacerlas?', 'Cada rutina muestra su fecha límite. En un plan de rutinas, las de cada ciclo valen hasta el día antes de tu siguiente corte; las nuevas se habilitan cuando Eileen las envía.'],
  ['📅', '¿Dónde veo mis clases?', 'En «Mi agenda» ves tus clases y los horarios libres. Si necesitas cambiar una, avísale a Eileen con tiempo.'],
  ['💳', '¿Dónde veo lo que he pagado?', 'En «Facturación» está lo pagado y lo pendiente. En «Mis informes» puedes descargar tu estado de cuenta.'],
  ['📲', '¿Cómo la instalo en mi teléfono?', 'En iPhone, ábrela en Safari, toca Compartir y elige “Agregar a pantalla de inicio”. En Android, usa el menú del navegador y “Instalar aplicación”. Toca el botón de abajo y te lo muestro paso a paso.'],
  ['🔔', '¿Cómo activo los avisos?', 'Toca la campanita y activa las notificaciones en este dispositivo. En iPhone solo funcionan con la app instalada en la pantalla de inicio.']
];
function portalGuideSection() {
  const host = document.getElementById('portal-dashboard'); if (!host || host.querySelector('#portal-guide')) return;
  const section = document.createElement('section'); section.className = 'card portal-guide'; section.id = 'portal-guide';
  section.innerHTML = `<p class="eyebrow">GUÍA RÁPIDA</p><h3>¿Cómo funciona todo esto? 💡</h3>${portalGuideItems.map(([icon, question, answer]) => `<details><summary><span aria-hidden="true">${icon}</span>${escapeHtml(question)}</summary><p>${helpRich(answer)}</p></details>`).join('')}<button type="button" class="secondary wide-button pwa-open" data-pwa-guide>📲 Ver la guía para instalar la app</button>`;
  host.append(section);
}

// ── Guía de instalación: pestañas, ventana y bienvenida del cliente ─────────────────────────────────────────────
function pwaDefaultPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/i.test(ua)) return 'android';
  return 'pc';
}
function pwaGuideMarkup(selected = pwaDefaultPlatform()) {
  return `<div class="pwa-guide">
    <p class="pwa-address">📍 Dirección de tu portal: <b>${escapeHtml(location.origin)}</b></p>
    <div class="pwa-tabs" role="tablist">${pwaGuide.platforms.map(platform => `<button type="button" role="tab" class="pwa-tab${platform.id === selected ? ' active' : ''}" aria-selected="${platform.id === selected}" data-pwa-tab="${platform.id}">${platform.icon} ${escapeHtml(platform.label)}</button>`).join('')}</div>
    ${pwaGuide.platforms.map(platform => `<div class="pwa-panel" data-pwa-panel="${platform.id}"${platform.id === selected ? '' : ' hidden'}><p>${helpRich(platform.intro)}</p><ol class="pwa-steps">${platform.steps.map(step => `<li>${helpRich(step)}</li>`).join('')}</ol></div>`).join('')}
    <h4 class="pwa-problems-title">¿Algo no sale? 🤔</h4>
    <div class="help-faq">${pwaGuide.problems.map(item => `<details><summary>${helpRich(item.q)}</summary><p>${helpRich(item.a)}</p></details>`).join('')}</div>
  </div>`;
}
// Ventana con la guía: desde la pantalla de acceso (sin sesión) y desde el portal.
function openPwaGuide() {
  const box = document.createElement('div');
  box.innerHTML = `<p class="eyebrow">TU APP EN EL TELÉFONO</p><h2>Crea tu acceso directo 📲</h2>
    <p class="pwa-lead">Con el ícono en tu pantalla de inicio abres Eileen Lifestyle de un toque y, en iPhone, recibes los avisos. Elige tu teléfono:</p>
    ${pwaGuideMarkup()}<button type="button" class="primary wide-button" data-pwa-close>Entendido</button>`;
  openModal(box, true);
}
// Primera vez del cliente: acaba de crear su contraseña con el enlace de Eileen.
function portalWelcome() {
  const box = document.createElement('div');
  box.innerHTML = `<p class="eyebrow">¡BIENVENIDO/A!</p><h2>Tu portal está listo 🎉</h2>
    <p class="pwa-lead">Tu contraseña quedó guardada. Para volver cuando quieras, entra a <b>${escapeHtml(location.origin)}</b> con tu correo y esa contraseña. Y para no tener que buscar la dirección, <b>crea el acceso directo</b> (toma un minuto):</p>
    ${pwaGuideMarkup()}<button type="button" class="primary wide-button" data-pwa-close>Entrar a mi portal</button>`;
  openModal(box, true);
}
document.addEventListener('click', event => {
  const open = event.target.closest?.('[data-pwa-guide]'); if (open) { openPwaGuide(); return; }
  const tab = event.target.closest?.('[data-pwa-tab]');
  if (tab) {
    const root = tab.closest('.pwa-guide'); if (!root) return;
    root.querySelectorAll('[data-pwa-tab]').forEach(button => { const active = button === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    root.querySelectorAll('[data-pwa-panel]').forEach(panel => { panel.hidden = panel.dataset.pwaPanel !== tab.dataset.pwaTab; });
    return;
  }
  if (event.target.closest?.('[data-pwa-close]') && typeof modal !== 'undefined' && modal.open) modal.close();
});

// ── Aviso de novedades ──────────────────────────────────────────────────────────────────────────────────────────
function whatsNewMarkup(releases) {
  return releases.map(release => `<section class="news-release"><p class="news-date">${escapeHtml(release.date)} · ${escapeHtml(release.title)}</p>
    ${release.items.map((item, index) => `<article class="news-item"><span class="news-icon" aria-hidden="true">${item.icon}</span><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.text)}</p>${item.go ? `<button type="button" class="secondary news-go" data-whatsnew-go="${escapeHtml(release.id)}:${index}">${escapeHtml(item.go.label)}</button>` : ''}</div></article>`).join('')}
  </section>`).join('');
}
function showWhatsNew(releases, { first = true } = {}) {
  const box = document.createElement('div');
  box.innerHTML = `<p class="eyebrow">NOVEDADES</p><h2>${first ? 'Lo nuevo en tu app ✨' : 'Novedades de la app ✨'}</h2>
    <p class="news-lead">${first ? 'Esto es lo que se agregó o mejoró desde la última vez. Solo te lo muestro una vez; después lo encuentras en «✨ Novedades» del menú de tu cuenta.' : 'Todo lo que se ha agregado o mejorado, de lo más nuevo a lo más antiguo.'}</p>
    ${whatsNewMarkup(releases)}<button type="button" class="primary wide-button" data-pwa-close>Entendido</button>`;
  openModal(box, true);
}
function openWhatsNew() { showWhatsNew(whatsNewReleases, { first: false }); }
// Al entrar el personal: si hay novedades que esta usuaria no ha visto, se muestran y se marcan como vistas.
async function maybeShowWhatsNew() {
  if (window.__sinNovedades) return;
  try {
    const { seen } = await api('/api/whats-new');
    const pending = whatsNewReleases.filter(release => !seen || release.id > seen);
    if (!pending.length || (typeof modal !== 'undefined' && modal.open)) return;
    showWhatsNew(pending);
    await api('/api/whats-new/seen', { method: 'POST', body: { id: whatsNewReleases[0].id } });
  } catch { /* las novedades nunca deben estorbar la entrada a la aplicación */ }
}
document.addEventListener('click', event => {
  const go = event.target.closest?.('[data-whatsnew-go]'); if (!go) return;
  const [releaseId, index] = go.dataset.whatsnewGo.split(':'); const target = whatsNewReleases.find(release => release.id === releaseId)?.items[Number(index)]?.go; if (!target) return;
  if (typeof modal !== 'undefined' && modal.open) modal.close();
  if (target.help) openHelp(target.help); else if (target.view) navigate(target.view);
});
