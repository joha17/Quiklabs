# Plataforma académica (beta)

Quiklabs funciona como plataforma de una universidad con licencia: **nadie se registra**. La administración crea las
cuentas de docentes y estudiantes (una por una o importando el padrón de matrícula), y un estudiante entra **solo
mientras tenga una matrícula activa en un curso vigente** y la licencia esté vigente.

## Cuentas ficticias de la beta

Los datos iniciales están en `worker/seed/data.json` (contraseñas con hash). Para regenerarlos: `npm run seed`.

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
| Entregas | Al entregar una práctica, la evaluación por evidencia del simulador se registra en el curso (reenviar el mismo intento lo reemplaza). Docentes y admin pueden abrir todas las prácticas sin generar entregas. |
| Auditoría (admin) | Registro de altas, cambios, matrículas, licencia, bloqueos y cambios de contraseña. |

Los intentos guardados en el navegador se separan por usuario (`clave:idUsuario`), así dos personas que usan el mismo
equipo no ven los intentos de la otra.

## Arquitectura

```text
worker/
├── index.ts          Worker: /api → API; el resto lo sirven los estáticos (assets.run_worker_first)
├── app.ts            API Hono: auth, admin, teacher, student (guardas por rol, CSRF: escrituras solo JSON)
├── core/             reglas sin dependencias de Cloudflare (se prueban en Node)
│   ├── types.ts      modelo de datos
│   ├── crypto.ts     PBKDF2, HMAC, contraseñas temporales
│   ├── store.ts      documento JSON en KV (clave db:v1); si KV está vacío, datos iniciales
│   └── service.ts    acceso, login, usuarios, cursos, matrículas, entregas, calificaciones, auditoría
└── seed/             datos ficticios (data.json) y su generador
src/app/platform/     login, cambio de contraseña, paneles de admin, docente y estudiante, sesión, registro de entregas
```

Rutas de la interfaz: portada (pública) · `#login` · `#panel` · `#p2` `#p3` `#p4` (exigen sesión; un estudiante solo
abre las prácticas abiertas en su curso).

## Desarrollo

```bash
cp .dev.vars.example .dev.vars      # y poner un SESSION_SECRET de al menos 32 caracteres
npm run dev:api                     # Worker + KV local en :8787 (compila el sitio primero)
npm run dev                         # Vite en :5173, /api se reenvía a :8787
```

`npm test` incluye `src/tests/unit/platform-api.test.ts` (la API real sobre un KV en memoria). Las pruebas e2e levantan
`wrangler dev` con un KV vacío en cada ejecución.

## Despliegue (Cloudflare)

1. Secreto de sesión (una vez): `npx wrangler secret put SESSION_SECRET` (cadena aleatoria de 48+ caracteres).
2. El espacio KV `DATA` se crea solo en el primer despliegue (`kv_namespaces` sin `id`); empieza vacío y toma los datos
   iniciales del repositorio hasta la primera escritura.
3. `git push` a `main` (Workers Builds) o `npx wrangler deploy`.

Sin el secreto, la API responde `SERVER_NOT_CONFIGURED` y nadie puede entrar (los estáticos se sirven igual).

## Límites conocidos de la beta

- **KV no es una base de datos**: todo vive en un documento; la última escritura gana y los cambios pueden tardar hasta
  ~60 s en verse en otras regiones. Para producción: Cloudflare D1.
- El control de acceso a los laboratorios es de la aplicación: el código de los simuladores es estático (no contiene
  datos de estudiantes), pero la API sí exige sesión, rol, matrícula y fechas para todo dato y toda entrega.
- La nota registrada la calcula el simulador en el navegador; un estudiante con conocimientos técnicos podría enviar una
  nota falsa. Para evaluaciones con peso, el docente debe revisar el intento (se puede exportar) o validar en servidor.
- No hay recuperación de contraseña por correo: la restablece la administración.
