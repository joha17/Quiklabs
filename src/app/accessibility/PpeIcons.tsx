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

const HAIR = '#5b3a24';
const HAIR_SHADE = '#472c1a';
const SKIN = '#f2c9a0';
const SKIN_SHADE = '#e3b085';

/**
 * Cabello: rostro completo de frente. Suelto cae a los lados sobre los hombros; recogido queda pegado a la cabeza
 * con un moño alto y gomita, y se ven las orejas.
 */
export function HairIcon({ worn }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <clipPath id="ppe-hair-clip">
          <circle cx="48" cy="48" r="46" />
        </clipPath>
      </defs>
      <circle cx="48" cy="48" r="46" className="ppe-backdrop" />
      <g clipPath="url(#ppe-hair-clip)">
        {/* Hombros (camiseta) */}
        <path d="M14 98 Q16 76 48 73 Q80 76 82 98 Z" fill="#5f87ad" />
        {/* Cabello suelto por detrás: cae sobre los hombros */}
        {!worn && <path d="M29 46 Q27 20 48 20 Q69 20 67 46 L71 84 Q64 88 59 81 L58 62 L38 62 L37 81 Q32 88 25 84 Z" fill={HAIR_SHADE} />}
        <rect x="42" y="58" width="12" height="17" rx="4" fill={SKIN_SHADE} />
        {worn && (
          <>
            <ellipse cx="33" cy="48" rx="3.2" ry="4.6" fill={SKIN_SHADE} />
            <ellipse cx="63" cy="48" rx="3.2" ry="4.6" fill={SKIN_SHADE} />
          </>
        )}
        <ellipse cx="48" cy="46" rx="15" ry="18" fill={SKIN} />
        {/* Rasgos */}
        <path d="M39.5 42.5 Q42 41 44.5 42.5" fill="none" stroke={HAIR} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M51.5 42.5 Q54 41 56.5 42.5" fill="none" stroke={HAIR} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="42" cy="47" r="1.9" fill="#2b3238" />
        <circle cx="54" cy="47" r="1.9" fill="#2b3238" />
        <path d="M48 49.5 Q46.6 53.5 48.6 54.2" fill="none" stroke="#c98f62" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="39.5" cy="54" r="2.6" fill="#ef9a8a" opacity="0.35" />
        <circle cx="56.5" cy="54" r="2.6" fill="#ef9a8a" opacity="0.35" />
        <path d="M43.5 57.5 Q48 61 52.5 57.5" fill="none" stroke="#a0603a" strokeWidth="1.7" strokeLinecap="round" />
        {worn ? (
          <>
            {/* Recogido: pegado a la cabeza, moño alto con gomita */}
            <circle cx="48" cy="17" r="8.5" fill={HAIR} />
            <path d="M42 15 Q48 11 54 15 M43 19.5 Q48 16 53 19.5" fill="none" stroke={HAIR_SHADE} strokeWidth="1.2" strokeLinecap="round" />
            <path d="M32.5 45 Q30.5 25.5 48 25.5 Q65.5 25.5 63.5 45 Q60 33 48 32.5 Q36 33 32.5 45 Z" fill={HAIR} />
            <path d="M40 28.5 Q44 27 47 29.5 M51 29 Q54.5 27.5 57.5 30" fill="none" stroke={HAIR_SHADE} strokeWidth="1" strokeLinecap="round" />
            <rect x="42.5" y="22.8" width="11" height="4.2" rx="2" fill="#e84a5f" />
          </>
        ) : (
          <>
            {/* Suelto: flequillo y mechones que tapan las orejas y caen junto a la cara */}
            <path d="M32 46 Q31 25 48 25 Q65 25 64 46 Q60 33 50 32 Q44 36 36 37 Q33 40 32 46 Z" fill={HAIR} />
            <path d="M33 38 Q29.5 52 31.5 69 L36.5 67 Q34.5 53 36.5 41 Z" fill={HAIR} />
            <path d="M63 38 Q66.5 52 64.5 69 L59.5 67 Q61.5 53 59.5 41 Z" fill={HAIR} />
          </>
        )}
      </g>
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
