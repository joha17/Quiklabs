# Plataforma académica (beta)

Quiklabs funciona como plataforma de una universidad con licencia: **nadie se registra**. La administración crea las
cuentas de docentes y estudiantes (una por una o importando el padrón de matrícula), y un estudiante entra **solo
mientras tenga una matrícula activa en un curso vigente** y la licencia esté vigente.

## Cuentas ficticias de la beta

Los datos iniciales están en `worker/seed/seed.sql` (contraseñas con hash), generados por `npm run seed`.

| Rol | Correo | Contraseña | Situación |
|---|---|---|---|
| Administración | admin@quiklabs.example | `Admin#Quiklabs2026` | |
| Docente | laura.mendez@uni.example | `Docente2026!` | QU-0100 G01 (2026-II) y G01 de 2026-I |
| Docente | carlos.rojas@uni.example | `Docente2026!` | QU-0100 G02 (2026-II) |
| Estudiante | valeria.solano@estudiante.uni.example | `Quimica2026!` | G01 · P2, P3 y P4 abiertas · con entregas |
| Estudiante | andres.jimenez@ · mariajose.vargas@ · diego.hernandez@ | `Quimica2026!` | G01 |
| Estudiante | camila.araya@ · sebastian.mora@ | `Quimica2026!` | G02 · P4 abre el 12 de octubre |
| Estudiante | josepablo.ramirez@estudiante.uni.example | `Quimica2026!` | G02 · debe cambiar la contraseña al entrar |
| Estudiante | daniela.chaves@estudiante.uni.example | `Quimica2026!` | cuenta **suspendida** |
| Estudiante | lucia.fernandez@estudiante.uni.example | `Quimica2026!` | curso 2026-I terminado → **sin acceso** |
| Estudiante | mateo.calderon@estudiante.uni.example | `Quimica2026!` | **retirado** de G01 → sin acceso |

(Los estudiantes usan el dominio `@estudiante.uni.example`.) Licencia: «Universidad Nacional de Ciencias (demo)»,
del 1/7/2026 al 30/6/2027, 120 cupos.

## Módulos

| Módulo | Qué hace |
|---|---|
| Autenticación | Login con correo y contraseña (PBKDF2-SHA256, 30 000 iteraciones), sesión en cookie httpOnly firmada (HMAC, 8 h), bloqueo de 15 min tras 5 intentos fallidos, cambio obligatorio de la contraseña asignada, cierre de sesiones al suspender o cambiar la contraseña. Sin registro público. |
| Usuarios (admin) | Alta con contraseña temporal (se muestra una vez), edición, cambio de rol, suspensión/reactivación, restablecer contraseña, desbloquear. No se puede quitar el último administrador ni degradarse a sí mismo. |
| Importar padrón (admin) | CSV `carné,nombre,correo` (coma, punto y coma o tabulador): crea las cuentas que faltan y las matricula en un curso; descarga de las contraseñas temporales en CSV; informe de filas omitidas. |
| Licencia (admin) | Institución, vigencia y cupo de estudiantes con matrícula activa (no se puede bajar del uso actual). |
| Cursos y matrículas (admin) | Cursos por sigla, periodo y grupo, con docentes y fechas; matricular, retirar, finalizar o reactivar. |
| Prácticas del grupo (docente) | Qué prácticas tiene el grupo, apertura, cierre y modo (Práctica, Guiado, Evaluación). |
| Calificaciones (docente/admin) | Mejor nota por estudiante y práctica, número de entregas; exportación CSV. |
| Panel del estudiante | Prácticas abiertas en sus cursos (entra en el modo que fijó su docente), cursos y fechas, historial de entregas con nota. |
| Entregas | Al entregar una práctica se envían el estado final del mundo, la libreta y la cinta de comandos del intento. **La nota la calcula el servidor** con la rúbrica de la práctica y anota los problemas de plausibilidad (reenviar el mismo intento lo reemplaza). Docentes y admin pueden abrir todas las prácticas sin generar entregas. |
| Verificación (docente/admin) | «Entregas y verificación»: nota recalculada, avisos (semilla, parámetros alterados, conservación, reloj, modo, nota del navegador distinta) y «Verificar intento», que repite la sesión tic a tic en el navegador del docente y registra si llega al mismo estado y nota (queda en la auditoría). |
| Auditoría (admin) | Registro de altas, cambios, matrículas, licencia, bloqueos y cambios de contraseña. |

Los intentos guardados en el navegador se separan por usuario (`clave:idUsuario`), así dos personas que usan el mismo
equipo no ven los intentos de la otra.

## Arquitectura

```text
worker/
├── index.ts          Worker: /api → API; el resto lo sirven los estáticos (assets.run_worker_first)
├── app.ts            API Hono: auth, admin, teacher, student (guardas por rol, CSRF: escrituras solo JSON)
├── core/             reglas sin dependencias de Cloudflare (se prueban en Node con SQLite)
│   ├── types.ts      modelo de datos
│   ├── crypto.ts     PBKDF2, HMAC, contraseñas temporales
│   ├── repo.ts       consultas SQL sobre D1 (interfaz mínima `SqlDb`)
│   ├── service.ts    acceso, login, usuarios, cursos, matrículas, entregas, calificaciones, auditoría
│   └── pack.ts       JSON comprimido (gzip + base64) del estado entregado y la cinta
└── seed/             datos ficticios (seed.sql), su generador y `to-sql.mjs`
migrations/           esquema de la base (D1/SQLite), versionado
src/app/platform/     login, cambio de contraseña, paneles de admin, docente y estudiante, sesión, registro de entregas,
                      cinta del intento (IndexedDB) y revisión de entregas
src/practices/grading.ts  calificación en el servidor y repetición de la cinta (código puro compartido con el Worker)
```

Rutas de la interfaz: portada (pública) · `#login` · `#panel` · `#p2` … `#p6` (exigen sesión; un estudiante solo
abre las prácticas abiertas en su curso).

## Desarrollo

```bash
cp .dev.vars.example .dev.vars      # y poner un SESSION_SECRET de al menos 32 caracteres
npm run db:setup                    # una vez: esquema + datos ficticios en la D1 local (.wrangler/)
npm run dev:api                     # Worker + D1 local en :8787 (compila el sitio primero)
npm run dev                         # Vite en :5173, /api se reenvía a :8787
```

`npm test` incluye `src/tests/unit/platform-api.test.ts`: la API real sobre SQLite de Node (`node:sqlite`) con las
mismas migraciones y datos (`src/tests/helpers/sqlite-d1.ts`). Las pruebas e2e levantan `wrangler dev` con una D1
local nueva en cada ejecución.

## Base de datos (Cloudflare D1)

Base `quiklabs` (binding `DB`), esquema en `migrations/`:

| Tabla | Contenido |
|---|---|
| `license` | institución, vigencia y cupo (una fila) |
| `users` | cuentas; correo y carné únicos; hash de contraseña, versión de sesión, bloqueo |
| `courses`, `course_teachers`, `course_labs` | cursos (sigla, periodo, grupo, fechas), sus docentes y sus prácticas (apertura, cierre, modo) |
| `enrollments` | matrícula estudiante–curso (única por par) y su estado |
| `submissions` | entregas (única por estudiante e intento: reenviar reemplaza); nota del servidor, nota del navegador, avisos y resultado de la repetición |
| `submission_data` | estado entregado, cinta y opciones de creación de cada entrega (gzip + base64, en partes de 1 MB) |
| `audit` | acciones de administración y seguridad |

Cada cambio y su registro de auditoría se escriben en un mismo lote atómico (`batch`). Para cambiar el esquema se agrega
un archivo `migrations/000N_…sql` y se aplica con `npm run db:migrate:remote` **antes** de desplegar el código que lo usa.
D1 guarda puntos de restauración («Time Travel»): `npx wrangler d1 time-travel restore quiklabs --timestamp …`.

## Despliegue (Cloudflare)

1. Secreto de sesión (ya configurado): `npx wrangler secret put SESSION_SECRET`.
2. Esquema: `npm run db:migrate:remote` (cuando haya migraciones nuevas).
3. `git push` a `main` (Workers Builds) o `npx wrangler deploy`.

Sin el secreto, la API responde `SERVER_NOT_CONFIGURED` y nadie puede entrar (los estáticos se sirven igual).
Los datos de la beta que estaban en Cloudflare KV se pasaron a D1 con `worker/seed/to-sql.mjs`; el espacio KV
`quiklabs-data` ya no se usa y se puede borrar.

## Límites conocidos de la beta

- D1 escribe desde una sola región (la base está en el este de Norteamérica). Para reportes analíticos pesados o mucha
  escritura simultánea, o si la universidad exige otra región, conviene PostgreSQL (vía Hyperdrive).
- El control de acceso a los laboratorios es de la aplicación: el código de los simuladores es estático (no contiene
  datos de estudiantes), pero la API sí exige sesión, rol, matrícula y fechas para todo dato y toda entrega.
- La nota la calcula el servidor a partir del estado final entregado, no la que envía el navegador. El servidor no
  repite el intento (el plan gratuito de Workers da 10 ms de CPU; recalcular cuesta ≈ 2–5 ms): un estado final
  fabricado con cuidado, coherente con la semilla, los parámetros y la conservación, pasaría el recálculo. Lo detecta
  «Verificar intento», que repite la cinta completa en el navegador del docente; para evaluaciones con peso conviene
  verificar las entregas antes de cerrar las notas. Con Workers Paid se podría repetir cada entrega en el servidor.
- La cinta vive en IndexedDB del navegador del estudiante: si cambia de equipo o borra los datos del sitio a mitad del
  intento, la entrega se califica igual pero no se puede repetir («Sin cinta»).
- No hay recuperación de contraseña por correo: la restablece la administración.
