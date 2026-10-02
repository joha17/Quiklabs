# Supuestos científicos y simplificaciones

Toda simplificación es **configurable** (archivo indicado entre paréntesis). Valores de referencia en §9 de la especificación.

## Sustancias y datos (`practices/practice-02/substances.ts`)

| Dato | Valor / fuente |
|---|---|
| Solubilidad del KNO₃ | Tabla de §4.4 (0–100 °C), interpolación lineal, **sin extrapolar** sobre 100 °C. |
| Solubilidad del NaCl | 35,7–39,2 g/100 g (0–100 °C), CRC Handbook. |
| Solubilidad de la sacarosa | 179–487 g/100 g (0–100 °C), CRC Handbook. |
| Densidades, calores específicos | Valores tabulados (PubChem / CRC) redondeados. |
| Volumen aparente de solutos | KNO₃ 0,37 mL/g; NaCl 0,28; sacarosa 0,62 — reproduce la densidad de las disoluciones (p. ej. KNO₃ ~16 % ≈ 1,10 g/mL). |
| Aceite vegetal / mineral | Mezclas homogéneas líquidas, **inmiscibles**; nunca se disuelven. Olor tenue / casi inodoro. |
| Agua | ρ ≈ 1,00 g/mL en todo el rango. |

## Mezcla carbón–KNO₃

- Relación másica 1:5 (0,4167 g C + 2,0833 g de reactivo en 2,50 g).
- **KNO₃ grado técnico al 98,5 %** (`reagentPurity`, `params.ts`): el 1,5 % restante son sales solubles inertes
  (`IMP`) que nunca saturan. Justificación: explica pureza por evaporación 97–99 % (las impurezas quedan en el depósito)
  frente a cristalización 98–99,5 % (quedan en la disolución madre). No participan en reacciones.
- El carbón es un sólido particulado insoluble; nunca se marca como disuelto (prueba 17.1-4).

## Disolución (`simulation/solutions/dissolution.ts`)

`velocidad = k · f(agitación) · e^{(T−25)/30} · √(300 µm / tamaño) · (m_sólido + 0,02 g) · déficit_relativo`

- Sin agitar la velocidad es el 12 % de la agitada (`restDissolveFactor`). A 25 °C los 2,083 g de KNO₃ se disuelven en 10 g de agua
  (prueba 17.1-2) en ~2 min agitando y mucho más lento sin agitar (§2.1, §4.5).
- Nunca supera la saturación ni transfiere más sólido del disponible.

## Térmico (`simulation/thermal/thermal.ts`)

`Q_neto = h_placa·(T_placa − T) − h_aire·(T − T_amb) − ṁ_evap·L` ; `ΔT = Q_neto·Δt / C_total`

- La placa tiene inercia propia (τ = 45 s) y temperatura máxima de 320 °C; **no fija** la temperatura del líquido.
- Evaporación superficial: `ṁ = k·A·(P_sat(T) − HR·P_sat(T_amb))` con Antoine; k calibrado a ≈0,12 g/min a 90 °C en un vaso de 50 mL.
- Al alcanzar el punto de ebullición, el exceso de energía evapora agua (la temperatura no sube).
- Punto de ebullición con elevación ebulloscópica ideal (Kb = 0,512, i = 2), acotada a +12 °C.
- Agua = 0 ⇒ la evaporación se detiene; el sólido y el recipiente se calientan rápido (riesgo D4). Nunca agua negativa.
- Baño de hielo: con hielo presente el baño tiende a ~0,5 °C; el calor recibido funde hielo (334 J/g).
- Vidrio de reloj parcial: evaporación ×0,6, salpicaduras ×0,2 (no sella).
- Corriente de convección en la balanza: un objeto caliente pesa aparentemente 2 mg/°C menos.

## Salpicaduras y pérdidas

- Ebullición sin agitar: 0,03 %/s del contenido; agitada: 0,001 %/s.
- Depósito pastoso (agua < 0,6 × sólido) hirviendo: 0,6 %/s (×0,2 con vidrio de reloj) — D2.
- Subida brusca de potencia (> 40 puntos) con líquido > 70 °C: salpica 4 % (B4).
- Adherencia a la pared al verter sólidos: 3 % del sólido insoluble máximo en vasos, 0,8 % en el papel de pesada.
- **Carbón seco recuperable = carbón en el papel × 0,975** (fibras del papel retienen el resto; `results.ts`).
- Película adherida al sacar la varilla (0,03 mL) o la sonda (0,02 mL).

## Filtración (`simulation/separation/filtration.ts`)

- Embudo = líquido sobre el papel; papel = torta + líquido retenido (tanque bien mezclado). Lavar desplaza la disolución retenida.
- Retención del papel: 0,6 mL + 0,9 mL por g de sólido.
- Caudal `k·(nivel + 0,3)` con k = 0,07 s⁻¹, ×0,7 si el papel está seco, ÷(1 + 1,5·torta), ×3 roto.
- Eficiencia de retención de carbón: 99,7 % correcto; 97 % seco (+4 % rodea el papel); 93 % mal doblado (+8 %); 55 % roto (+35 %).
- Capacidad del cono de papel: 6 mL; por encima el líquido rodea el papel con su sólido (C4).
- Verter > 2,5 mL/s sin varilla: probabilidad de rasgar el papel (C5/C3).
- Espiga sin tocar la pared: 2 % del goteo salpica fuera.

## Cristalización (`simulation/separation/crystallization.ts`)

- Sobresaturación S = disuelto / capacidad(T). Nunca cristaliza con S ≤ 1.
- Nucleación con demora reproducible (25–70 s según semilla) que se acorta con S, agitación (×2), raspado (×30 durante 12 s),
  cristal semilla o KNO₃ sin disolver (crecimiento inmediato) y costra en recipientes que evaporan (×8).
- Crecimiento de primer orden: `dm = (disuelto − capacidad)·(1 − e^{−k·Δt})`, k = 0,03 s⁻¹ (×(1+agitación)); nunca todo en un paso.
- Siempre queda KNO₃ en la disolución madre (capacidad > 0 a 0 °C).
- Pureza intrínseca 99,6 % (lento) a 97,5 % (enfriamiento brusco, inclusiones). La pureza aparente descuenta el carbón presente.
  Simplificación: las inclusiones de disolución madre se modelan como atributo de pureza, no como masa separada de impurezas.
- Tamaño medio ∝ (masa / nº de núcleos)^{1/3}; muchos núcleos con enfriamiento rápido ⇒ cristales pequeños.

## Seguridad

- Mezcla «seca o casi seca» = carbón ≥ 5 mg + KNO₃ y agua < 15 % de la masa total. Sobre calor ⇒ bloqueo crítico, placa apagada.
  **Nunca** se simula ignición, deflagración ni combustión.
- Choque térmico: ΔT > 45 °C al baño ⇒ probabilidad de rotura 25–85 % (según semilla y ΔT).
- Quemadura: tomar con la mano objetos > 60 °C (aviso sin bloqueo entre 45 y 60 °C).
- Sólido seco sobre la placa: decoloración > 230 °C; incidente y práctica detenida > 260 °C (D4).
- Derrame importante: ≥ 5 mL sobre la mesada ⇒ bloqueo hasta limpiar.

## Variabilidad controlada (semilla)

Masa de la punta de espátula (±25 %), gota (±8 %), tara de cada recipiente, demora de nucleación, número de núcleos (±25 %),
velocidad de disolución (±10 %), probabilidades de rasgado/rotura. Nunca cambia identidades químicas ni la conservación de masa.

## Balance de masa

Para cada componente: `tomado de los envases = en recipientes + en filtro + en residuo + derramado + adherido + desechado (+ evaporado)`.
Se verifica con tolerancia < 1 mg en las pruebas (conservación global < 1 µg).
