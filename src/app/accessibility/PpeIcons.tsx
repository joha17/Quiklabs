/**
 * Ilustraciones del equipo de protección personal (SVG dibujado por código, sin imágenes externas).
 * Son decorativas (aria-hidden): el nombre accesible lo da el botón que las contiene.
 */
type IconProps = { worn: boolean };

const OUTLINE = '#55636f';

/** Bata de laboratorio: con los botones abrochados cuando está puesta. */
export function CoatIcon({ worn }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <path d="M25 30 L13 70 L22 73 L31 45 Z" fill="#fff" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M71 30 L83 70 L74 73 L65 45 Z" fill="#fff" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M30 22 L40 17 L48 30 L56 17 L66 22 L71 30 L68 85 L28 85 L25 30 Z" fill="#fff" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 17 L48 30 L44 47 L35 26 Z" fill="#e8edf2" stroke={OUTLINE} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M56 17 L48 30 L52 47 L61 26 Z" fill="#e8edf2" stroke={OUTLINE} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="48" y1="30" x2="48" y2="85" stroke={OUTLINE} strokeWidth="1.5" />
      {[52, 63, 74].map((y) => (
        <circle key={y} cx={worn ? 48 : 51} cy={y} r="2.2" fill="#1f6fbf" />
      ))}
      <rect x="31" y="62" width="11" height="9" rx="1.5" fill="none" stroke={OUTLINE} strokeWidth="1.5" />
      <rect x="54" y="62" width="11" height="9" rx="1.5" fill="none" stroke={OUTLINE} strokeWidth="1.5" />
      <rect x="55" y="34" width="9" height="7" rx="1.2" fill="none" stroke={OUTLINE} strokeWidth="1.3" />
      <rect x="58" y="29" width="2" height="8" rx="1" fill="#1f6fbf" />
    </svg>
  );
}

/** Gafas de seguridad con montura envolvente, ventilación y banda elástica. */
export function GogglesIcon({ worn }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <path d="M8 50 Q48 40 88 50" fill="none" stroke="#2b3238" strokeWidth="5" strokeLinecap="round" />
      <path d="M16 38 Q16 32 24 32 L72 32 Q80 32 80 38 L80 56 Q80 64 70 64 L56 64 Q52 64 50 59 Q48 55 46 59 Q44 64 40 64 L26 64 Q16 64 16 56 Z" fill="#f2b705" stroke="#8a6800" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 40 Q21 37 25 37 L44 37 Q46 37 46 40 L46 55 Q46 59 42 59 L27 59 Q21 59 21 54 Z" fill="#bfe3ff" stroke="#5f8fb8" strokeWidth="1.2" />
      <path d="M50 40 Q50 37 52 37 L71 37 Q75 37 75 40 L75 54 Q75 59 69 59 L54 59 Q50 59 50 55 Z" fill="#bfe3ff" stroke="#5f8fb8" strokeWidth="1.2" />
      <path d="M25 41 L32 41 L26 50 Z" fill="#ffffff" opacity="0.75" />
      <path d="M54 41 L61 41 L55 50 Z" fill="#ffffff" opacity="0.75" />
      {[28, 36, 60, 68].map((x) => (
        <circle key={x} cx={x} cy="34.5" r="1.1" fill="#8a6800" />
      ))}
      {worn && <path d="M30 70 Q48 76 66 70" fill="none" stroke="#1e8e4e" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}

/** Cabello recogido: perfil con moño y gomita. */
export function HairIcon({ worn }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <rect x="40" y="66" width="14" height="14" rx="3" fill="#e9b88c" />
      <circle cx="46" cy="50" r="20" fill="#f2c9a0" />
      <circle cx="33" cy="52" r="3.5" fill="#e9b88c" />
      {worn ? (
        <>
          <path d="M26 50 Q24 26 46 26 Q66 26 67 46 Q60 35 46 35 Q34 36 30 52 Z" fill="#5b3a24" />
          <circle cx="68" cy="31" r="10" fill="#5b3a24" />
          <rect x="59" y="33" width="7" height="5" rx="2" transform="rotate(-35 62 35)" fill="#e84a5f" />
        </>
      ) : (
        <path d="M26 54 Q22 24 46 25 Q70 26 68 52 L72 76 Q64 70 62 58 Q60 40 46 36 Q32 38 30 56 L24 74 Q22 62 26 54 Z" fill="#5b3a24" />
      )}
      <circle cx="53" cy="50" r="2" fill="#2b3238" />
      <path d="M50 59 Q54 62 58 58" fill="none" stroke="#a0603a" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Calzado cerrado: zapato con puntera y cordones. */
export function ShoesIcon({ worn }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <path d="M12 64 L84 64 Q88 64 88 68 L88 72 Q88 74 86 74 L14 74 Q12 74 12 72 Z" fill="#2b3238" />
      <path d="M14 64 Q13 46 26 42 L40 36 Q47 33 52 40 L58 49 Q72 51 82 57 Q87 60 86 64 Z" fill="#6b4a2f" stroke="#3f2a19" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M66 52 Q78 54 84 60 Q86 62 85 64 L64 64 Q62 57 66 52 Z" fill="#7d5838" />
      <path d="M40 38 Q47 35 51 41 L56 49 L44 52 Z" fill="#5a3d26" />
      {[0, 1, 2].map((i) => (
        <line key={i} x1={42 + i * 4} y1={41 + i * 3} x2={50 + i * 4} y2={38 + i * 3} stroke="#f4efe6" strokeWidth="1.6" strokeLinecap="round" />
      ))}
      <path d="M18 58 L84 58" stroke="#3f2a19" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.6" />
      {worn && <circle cx="24" cy="50" r="3" fill="#1e8e4e" />}
    </svg>
  );
}
