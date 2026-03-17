import produce from 'immer';
import { MatrixClient, Room } from 'matrix-js-sdk';
import { getRoomPermissionsAPI } from '../hooks/useRoomPermissions';
import {
  applyPermissionPower,
  getPermissionPower,
  IPowerLevels,
  PermissionLocation,
  USER_DEFAULT_LOCATION,
} from '../hooks/usePowerLevels';
import { PowerLevelTags } from '../hooks/usePowerLevelTags';
import { StateEvent } from '../../types/matrix/room';
import {
  PresetApplicationStatus,
  PresetPermissions,
  RoomPreset,
  RoomPresetsContent,
} from '../../types/matrix/roomPresets';
import { PermissionGroup } from '../features/common-settings/permissions/types';

// ─── Permission checks ────────────────────────────────────────────────────────

export function canManageSpacePresets(
  powerLevels: IPowerLevels,
  creators: Set<string>,
  userId: string
): boolean {
  return getRoomPermissionsAPI(creators, powerLevels).stateEvent(
    StateEvent.SpaceRoomPresets,
    userId
  );
}

export function canApplyPresetToRoom(
  powerLevels: IPowerLevels,
  creators: Set<string>,
  userId: string
): boolean {
  return getRoomPermissionsAPI(creators, powerLevels).stateEvent(
    StateEvent.RoomPowerLevels,
    userId
  );
}

// ─── PermissionLocation ↔ PresetPermissions mapping ──────────────────────────

/**
 * Read the value for a PermissionLocation from PresetPermissions.
 * Returns undefined if that permission is not set in the preset ("do not change").
 */
export function getPresetPermissionValue(
  permissions: PresetPermissions,
  location: PermissionLocation
): number | undefined {
  if ('user' in location && !location.key) return permissions.users_default;
  if ('action' in location) {
    const key = location.key as keyof PresetPermissions;
    return permissions[key] as number | undefined;
  }
  if ('notification' in location) return permissions.notifications?.[location.key];
  if ('state' in location) {
    if (!location.key) return permissions.state_default;
    return permissions.events?.[location.key];
  }
  // message events / events_default
  if (!location.key) return permissions.events_default;
  return permissions.events?.[location.key];
}

/**
 * Set (or clear by passing undefined) a permission value in PresetPermissions.
 */
export function setPresetPermissionValue(
  permissions: PresetPermissions,
  location: PermissionLocation,
  value: number | undefined
): PresetPermissions {
  const next = { ...permissions };

  const setOrDelete = <K extends keyof PresetPermissions>(
    obj: PresetPermissions,
    key: K,
    val: number | undefined
  ) => {
    if (val === undefined) {
      delete obj[key];
    } else {
      (obj[key] as number) = val;
    }
  };

  if ('user' in location && !location.key) {
    setOrDelete(next, 'users_default', value);
    return next;
  }
  if ('action' in location) {
    setOrDelete(next, location.key as keyof PresetPermissions, value);
    return next;
  }
  if ('notification' in location) {
    if (value === undefined) {
      const notifs = { ...(next.notifications ?? {}) };
      delete notifs[location.key];
      next.notifications = Object.keys(notifs).length ? notifs : undefined;
    } else {
      next.notifications = { ...(next.notifications ?? {}), [location.key]: value };
    }
    return next;
  }
  if ('state' in location) {
    if (!location.key) {
      setOrDelete(next, 'state_default', value);
      return next;
    }
    if (value === undefined) {
      const evts = { ...(next.events ?? {}) };
      delete evts[location.key];
      next.events = Object.keys(evts).length ? evts : undefined;
    } else {
      next.events = { ...(next.events ?? {}), [location.key]: value };
    }
    return next;
  }
  // message events / events_default
  if (!location.key) {
    setOrDelete(next, 'events_default', value);
    return next;
  }
  if (value === undefined) {
    const evts = { ...(next.events ?? {}) };
    delete evts[location.key];
    next.events = Object.keys(evts).length ? evts : undefined;
  } else {
    next.events = { ...(next.events ?? {}), [location.key]: value };
  }
  return next;
}

/**
 * Convert a preset's PresetPermissions to a Map<PermissionLocation, number>
 * suitable for pre-loading into PermissionGroups as pending changes.
 * Only entries explicitly set in the preset are included.
 */
export function presetPermissionsToMap(
  permissions: PresetPermissions,
  permissionGroups: PermissionGroup[]
): Map<PermissionLocation, number> {
  const map = new Map<PermissionLocation, number>();

  const tryAdd = (location: PermissionLocation) => {
    const val = getPresetPermissionValue(permissions, location);
    if (typeof val === 'number') map.set(location, val);
  };

  // users_default
  tryAdd(USER_DEFAULT_LOCATION);

  permissionGroups.forEach((group) =>
    group.items.forEach((item) => {
      tryAdd(item.location);
    })
  );

  return map;
}

/**
 * Build a PresetPermissions that captures every permission visible in the given
 * permission groups plus users_default, reflecting the current room state.
 * All fields are explicitly set (no "do not change" entries) so the preset
 * represents a complete snapshot.
 */
export function powerLevelsToPresetPermissions(
  powerLevels: IPowerLevels,
  permissionGroups: PermissionGroup[]
): PresetPermissions {
  let perms: PresetPermissions = {};

  // users_default
  perms = setPresetPermissionValue(
    perms,
    USER_DEFAULT_LOCATION,
    powerLevels.users_default ?? 0
  );

  permissionGroups.forEach((group) =>
    group.items.forEach((item) => {
      const power = getPermissionPower(powerLevels, item.location);
      perms = setPresetPermissionValue(perms, item.location, power);
    })
  );

  return perms;
}

// ─── Compatibility ────────────────────────────────────────────────────────────

/**
 * A preset is compatible with a room type when:
 *  - It has no permissions (labels-only preset) → universal, applies to any room type
 *  - It has permissions → must match the preset's declared roomType exactly
 */
export function isPresetCompatible(preset: RoomPreset, roomType: string | null): boolean {
  const hasPermissions =
    preset.permissions !== undefined && Object.keys(preset.permissions).length > 0;
  if (!hasPermissions) return true;
  return preset.roomType === roomType;
}

// ─── Status check ─────────────────────────────────────────────────────────────

export function getPresetApplicationStatus(
  room: Room,
  preset: RoomPreset,
  roomPowerLevels: IPowerLevels,
  canModify: boolean
): PresetApplicationStatus {
  if (!canModify) return 'no-permission';

  const roomType = room.getType() ?? null;
  if (!isPresetCompatible(preset, roomType)) return 'type-mismatch';

  // Check if any power level tag differs
  if (preset.powerLevelTags && Object.keys(preset.powerLevelTags).length > 0) {
    const roomTagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
    const roomTags: PowerLevelTags = roomTagsEvent?.getContent<PowerLevelTags>() ?? {};
    for (const [powerStr, presetTag] of Object.entries(preset.powerLevelTags)) {
      const roomTag = roomTags[Number(powerStr)];
      if (!roomTag || roomTag.name !== presetTag.name || roomTag.color !== presetTag.color) {
        return 'needs-sync';
      }
    }
  }

  if (!preset.permissions) return 'in-sync';

  // Check if any permission value differs
  const perms = preset.permissions;
  const checks: Array<[keyof IPowerLevels, number | undefined]> = [
    ['users_default', perms.users_default],
    ['events_default', perms.events_default],
    ['state_default', perms.state_default],
    ['invite', perms.invite],
    ['kick', perms.kick],
    ['ban', perms.ban],
    ['redact', perms.redact],
    ['historical', perms.historical],
  ];

  for (const [key, val] of checks) {
    if (val !== undefined && roomPowerLevels[key] !== val) return 'needs-sync';
  }

  if (perms.events) {
    for (const [evtType, val] of Object.entries(perms.events)) {
      if ((roomPowerLevels.events ?? {})[evtType] !== val) return 'needs-sync';
    }
  }
  if (perms.notifications) {
    for (const [notifKey, val] of Object.entries(perms.notifications)) {
      if ((roomPowerLevels.notifications ?? {})[notifKey] !== val) return 'needs-sync';
    }
  }

  return 'in-sync';
}

// ─── Tag conflict resolution ─────────────────────────────────────────────────

export type TagConflict = {
  power: number;
  roomTag: import('../hooks/usePowerLevelTags').PowerLevelTags[number];
  presetTag: import('../hooks/usePowerLevelTags').PowerLevelTags[number];
};

export function getTagConflicts(
  roomTags: PowerLevelTags,
  presetTags: PowerLevelTags
): TagConflict[] {
  const conflicts: TagConflict[] = [];
  Object.entries(presetTags).forEach(([powerStr, presetTag]) => {
    const power = Number(powerStr);
    const roomTag = roomTags[power];
    if (roomTag && roomTag.name !== presetTag.name) {
      conflicts.push({ power, roomTag, presetTag });
    }
  });
  return conflicts;
}

export function mergePresetTags(
  roomTags: PowerLevelTags,
  presetTags: PowerLevelTags,
  resolutions: Record<number, 'preset' | 'room'>
): PowerLevelTags {
  const merged = { ...roomTags };
  Object.entries(presetTags).forEach(([powerStr, presetTag]) => {
    const power = Number(powerStr);
    const resolution = resolutions[power] ?? 'preset';
    if (resolution === 'preset') {
      merged[power] = presetTag;
    }
    // 'room' = keep existing roomTag, so no change needed
  });
  return merged;
}

// ─── Application ─────────────────────────────────────────────────────────────

/**
 * Apply a preset's permissions (and optionally tags) to a room.
 * Only permissions explicitly set in the preset are overwritten.
 */
export async function applyPresetToRoom(
  mx: MatrixClient,
  room: Room,
  preset: RoomPreset,
  currentPowerLevels: IPowerLevels,
  resolvedTags?: PowerLevelTags
): Promise<void> {
  if (preset.permissions && Object.keys(preset.permissions).length > 0) {
    const editedPowerLevels = produce(currentPowerLevels, (draft) => {
      const perms = preset.permissions!;
      if (typeof perms.users_default === 'number') draft.users_default = perms.users_default;
      if (typeof perms.events_default === 'number') draft.events_default = perms.events_default;
      if (typeof perms.state_default === 'number') draft.state_default = perms.state_default;
      if (typeof perms.invite === 'number') draft.invite = perms.invite;
      if (typeof perms.kick === 'number') draft.kick = perms.kick;
      if (typeof perms.ban === 'number') draft.ban = perms.ban;
      if (typeof perms.redact === 'number') draft.redact = perms.redact;
      if (typeof perms.historical === 'number') draft.historical = perms.historical;
      if (perms.events) {
        draft.events = { ...(draft.events ?? {}), ...perms.events };
      }
      if (perms.notifications) {
        draft.notifications = { ...(draft.notifications ?? {}), ...perms.notifications };
      }
    });
    await mx.sendStateEvent(room.roomId, StateEvent.RoomPowerLevels, editedPowerLevels, '');
  }

  if (resolvedTags) {
    await mx.sendStateEvent(room.roomId, StateEvent.PowerLevelTags as any, resolvedTags);
  }
}

// ─── Preset CRUD helpers ─────────────────────────────────────────────────────

export function createPreset(
  partial: Pick<RoomPreset, 'name' | 'description' | 'roomType' | 'permissions' | 'powerLevelTags'>
): RoomPreset {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

export function updatePreset(existing: RoomPreset, changes: Partial<RoomPreset>): RoomPreset {
  return { ...existing, ...changes, updatedAt: Date.now() };
}

export function savePreset(content: RoomPresetsContent, preset: RoomPreset): RoomPresetsContent {
  const idx = content.presets.findIndex((p) => p.id === preset.id);
  if (idx === -1) return { presets: [...content.presets, preset] };
  const next = [...content.presets];
  next[idx] = preset;
  return { presets: next };
}

export function deletePreset(content: RoomPresetsContent, presetId: string): RoomPresetsContent {
  return { presets: content.presets.filter((p) => p.id !== presetId) };
}

export function getPresetsForRoomType(
  content: RoomPresetsContent,
  roomType: string | null
): RoomPreset[] {
  return content.presets.filter((p) => p.roomType === roomType);
}
