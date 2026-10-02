/**
 * Zonas de encaje suave (§7): solo soporte–anillo, embudo–anillo, papel–embudo, tubo–gradilla,
 * vaso/cápsula–placa, balanza y baño. Los reactivos NO encajan sobre recipientes.
 */
import type { Vessel, World } from '../../simulation/entities/types';
import { RACK_SLOT_DX, RING_GRIP_Z, RING_OFFSET_X, SUPPORT_Z, VESSEL_DIM } from './dimensions';

export interface SupportZone {
  id: string;
  x: number;
  y: number;
  z: number;
  snapR: number;
  accepts: (v: Vessel) => boolean;
}

const tube = (v: Vessel) => v.type === 'TEST_TUBE';
const heatable = (v: Vessel) => ['BEAKER', 'PORCELAIN_DISH', 'TEST_TUBE', 'GRADUATED_CYLINDER', 'WEIGH_PAPER', 'FILTER_PAPER', 'TOWEL', 'VIAL'].includes(v.type);
const weighable = (v: Vessel) => ['BEAKER', 'PORCELAIN_DISH', 'WEIGH_PAPER', 'VIAL', 'TEST_TUBE', 'FILTER_PAPER'].includes(v.type);

export function supportZones(w: World): SupportZone[] {
  const zones: SupportZone[] = [];
  const rack = w.props.rack;
  if (rack && rack.support !== null) {
    for (let i = 0; i < 6; i++) {
      zones.push({ id: `rack:${i}`, x: rack.pose.x - 2.5 * RACK_SLOT_DX + i * RACK_SLOT_DX, y: rack.pose.y, z: SUPPORT_Z.rack, snapR: 2.4, accepts: tube });
    }
  }
  const tray = w.props.tray;
  if (tray && tray.support !== null) {
    for (let i = 0; i < 6; i++) {
      zones.push({ id: `tray:${i}`, x: tray.pose.x - 2.5 * 4.2 + i * 4.2, y: tray.pose.y, z: SUPPORT_Z.tray, snapR: 1.8, accepts: tube });
    }
  }
  const hp = w.props.hotplate;
  if (hp && hp.support !== null) zones.push({ id: 'hotplate', x: hp.pose.x, y: hp.pose.y, z: SUPPORT_Z.hotplate, snapR: 5, accepts: heatable });
  const bal = w.props.balance;
  if (bal && bal.support !== null) zones.push({ id: 'balance', x: bal.pose.x, y: bal.pose.y + 1, z: SUPPORT_Z.balance, snapR: 4.5, accepts: weighable });
  const st = w.props.stand;
  if (st && st.support !== null) {
    zones.push({
      id: 'ring', x: st.pose.x + RING_OFFSET_X, y: st.pose.y, z: w.devices.stand.ringHeightCm - RING_GRIP_Z, snapR: 3.5,
      accepts: (v) => v.type === 'FUNNEL',
    });
  }
  const funnel = Object.values(w.vessels).find((v) => v.type === 'FUNNEL' && v.integrity === 1);
  if (funnel && !funnel.funnel?.paperId) {
    zones.push({
      id: 'funnel', x: funnel.pose.x, y: funnel.pose.y, z: funnel.pose.z + 0.3, snapR: 3,
      accepts: (v) => v.type === 'FILTER_PAPER' && !!v.filter?.fold.startsWith('CONE'),
    });
  }
  const bath = w.vessels.bath;
  if (bath && bath.integrity === 1) {
    zones.push({ id: 'bath', x: bath.pose.x, y: bath.pose.y, z: bath.pose.z + SUPPORT_Z.bath, snapR: 4, accepts: (v) => v.type === 'BEAKER' });
  }
  return zones;
}

export function zoneById(w: World, id: string | null): SupportZone | null {
  if (!id) return null;
  return supportZones(w).find((z) => z.id === id) ?? null;
}

export function zoneOccupied(w: World, zoneId: string, exceptId?: string): boolean {
  if (zoneId === 'funnel') return false;
  for (const vid in w.vessels) {
    const v = w.vessels[vid];
    if (vid !== exceptId && v.support === zoneId && v.integrity === 1) return true;
  }
  return false;
}

/** Posición de la boca de un recipiente en el mundo (centro y altura). */
export function mouthOf(v: Vessel): { x: number; y: number; z: number; r: number } {
  const d = VESSEL_DIM[v.type];
  return { x: v.pose.x, y: v.pose.y, z: v.pose.z + d.mouthZ, r: d.mouthR };
}
