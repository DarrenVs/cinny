import produce from 'immer';
import { MatrixClient, Room } from 'matrix-js-sdk';
import { getRoomPermissionsAPI } from '../hooks/useRoomPermissions';
import { getRoomCreatorsForRoomId } from '../hooks/useRoomCreators';
import { getStateEvent } from './room';
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
  TemplateApplicationStatus,
  TemplatePermissions,
  RoomTemplate,
  RoomTemplatesContent,
} from '../../types/matrix/roomTemplates';
import { PermissionGroup } from '../features/common-settings/permissions/types';

// ─── Permission checks ────────────────────────────────────────────────────────

export function canManageSpaceTemplates(
  powerLevels: IPowerLevels,
  creators: Set<string>,
  userId: string
): boolean {
  return getRoomPermissionsAPI(creators, powerLevels).stateEvent(
    StateEvent.SpaceRoomTemplates,
    userId
  );
}

/** Synchronous version — safe to call outside of hooks for conditional space checks. */
export function canManageTemplatesInSpace(
  mx: MatrixClient,
  space: Room | undefined,
  userId: string
): boolean {
  if (!space) return false;
  const plEvent = getStateEvent(space, StateEvent.RoomPowerLevels);
  const powerLevels = plEvent?.getContent<IPowerLevels>() ?? {};
  const creators = getRoomCreatorsForRoomId(mx, space.roomId);
  return canManageSpaceTemplates(powerLevels, creators, userId);
}

export function canApplyTemplateToRoom(
  powerLevels: IPowerLevels,
  creators: Set<string>,
  userId: string
): boolean {
  return getRoomPermissionsAPI(creators, powerLevels).stateEvent(
    StateEvent.RoomPowerLevels,
    userId
  );
}

// ─── PermissionLocation ↔ TemplatePermissions mapping ──────────────────────────

/**
 * Read the value for a PermissionLocation from TemplatePermissions.
 * Returns undefined if that permission is not set in the template ("do not change").
 */
export function getTemplatePermissionValue(
  permissions: TemplatePermissions,
  location: PermissionLocation
): number | undefined {
  if ('user' in location && !location.key) return permissions.users_default;
  if ('action' in location) {
    const key = location.key as keyof TemplatePermissions;
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
 * Set (or clear by passing undefined) a permission value in TemplatePermissions.
 */
export function setTemplatePermissionValue(
  permissions: TemplatePermissions,
  location: PermissionLocation,
  value: number | undefined
): TemplatePermissions {
  const next = { ...permissions };

  const setOrDelete = <K extends keyof TemplatePermissions>(
    obj: TemplatePermissions,
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
    setOrDelete(next, location.key as keyof TemplatePermissions, value);
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
 * Convert a template's TemplatePermissions to a Map<PermissionLocation, number>
 * suitable for pre-loading into PermissionGroups as pending changes.
 * Only entries explicitly set in the template are included.
 */
export function templatePermissionsToMap(
  permissions: TemplatePermissions,
  permissionGroups: PermissionGroup[]
): Map<PermissionLocation, number> {
  const map = new Map<PermissionLocation, number>();

  const tryAdd = (location: PermissionLocation) => {
    const val = getTemplatePermissionValue(permissions, location);
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
 * Build a TemplatePermissions that captures every permission visible in the given
 * permission groups plus users_default, reflecting the current room state.
 * All fields are explicitly set (no "do not change" entries) so the template
 * represents a complete snapshot.
 */
export function powerLevelsToTemplatePermissions(
  powerLevels: IPowerLevels,
  permissionGroups: PermissionGroup[]
): TemplatePermissions {
  let perms: TemplatePermissions = {};

  // users_default
  perms = setTemplatePermissionValue(
    perms,
    USER_DEFAULT_LOCATION,
    powerLevels.users_default ?? 0
  );

  permissionGroups.forEach((group) =>
    group.items.forEach((item) => {
      const power = getPermissionPower(powerLevels, item.location);
      perms = setTemplatePermissionValue(perms, item.location, power);
    })
  );

  return perms;
}

// ─── Compatibility ────────────────────────────────────────────────────────────

/**
 * A template is compatible with a room type when:
 *  - It has no permissions (labels-only template) → universal, applies to any room type
 *  - It has permissions → must match the template's declared roomType exactly
 */
export function isTemplateCompatible(template: RoomTemplate, roomType: string | null): boolean {
  const hasPermissions =
    template.permissions !== undefined && Object.keys(template.permissions).length > 0;
  if (!hasPermissions) return true;
  return template.roomType === roomType;
}

// ─── Status check ─────────────────────────────────────────────────────────────

export function getTemplateApplicationStatus(
  room: Room,
  template: RoomTemplate,
  roomPowerLevels: IPowerLevels,
  canModify: boolean
): TemplateApplicationStatus {
  if (!canModify) return 'no-permission';

  const roomType = room.getType() ?? null;
  if (!isTemplateCompatible(template, roomType)) return 'type-mismatch';

  // Check if any power level tag differs
  if (template.powerLevelTags && Object.keys(template.powerLevelTags).length > 0) {
    const roomTagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
    const roomTags: PowerLevelTags = roomTagsEvent?.getContent<PowerLevelTags>() ?? {};
    for (const [powerStr, templateTag] of Object.entries(template.powerLevelTags)) {
      const roomTag = roomTags[Number(powerStr)];
      if (!roomTag || roomTag.name !== templateTag.name || roomTag.color !== templateTag.color) {
        return 'needs-sync';
      }
    }
  }

  if (!template.permissions) return 'in-sync';

  // Check if any permission value differs
  const perms = template.permissions;
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
  templateTag: import('../hooks/usePowerLevelTags').PowerLevelTags[number];
};

export function getTagConflicts(
  roomTags: PowerLevelTags,
  templateTags: PowerLevelTags
): TagConflict[] {
  const conflicts: TagConflict[] = [];
  Object.entries(templateTags).forEach(([powerStr, templateTag]) => {
    const power = Number(powerStr);
    const roomTag = roomTags[power];
    if (roomTag && roomTag.name !== templateTag.name) {
      conflicts.push({ power, roomTag, templateTag });
    }
  });
  return conflicts;
}

export function mergeTemplateTags(
  roomTags: PowerLevelTags,
  templateTags: PowerLevelTags,
  resolutions: Record<number, 'template' | 'room'>
): PowerLevelTags {
  const merged = { ...roomTags };
  Object.entries(templateTags).forEach(([powerStr, templateTag]) => {
    const power = Number(powerStr);
    const resolution = resolutions[power] ?? 'template';
    if (resolution === 'template') {
      merged[power] = templateTag;
    }
    // 'room' = keep existing roomTag, so no change needed
  });
  return merged;
}

// ─── Application ─────────────────────────────────────────────────────────────

/**
 * Apply a template's permissions (and optionally tags) to a room.
 * Only permissions explicitly set in the template are overwritten.
 */
export async function applyTemplateToRoom(
  mx: MatrixClient,
  room: Room,
  template: RoomTemplate,
  currentPowerLevels: IPowerLevels,
  resolvedTags?: PowerLevelTags
): Promise<void> {
  if (template.permissions && Object.keys(template.permissions).length > 0) {
    const editedPowerLevels = produce(currentPowerLevels, (draft) => {
      const perms = template.permissions!;
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

// ─── Template CRUD helpers ─────────────────────────────────────────────────────

export function createTemplate(
  partial: Pick<RoomTemplate, 'name' | 'description' | 'roomType' | 'permissions' | 'powerLevelTags'>
): RoomTemplate {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

export function updateTemplate(existing: RoomTemplate, changes: Partial<RoomTemplate>): RoomTemplate {
  return { ...existing, ...changes, updatedAt: Date.now() };
}

export function saveTemplate(content: RoomTemplatesContent, template: RoomTemplate): RoomTemplatesContent {
  const idx = content.presets.findIndex((p) => p.id === template.id);
  if (idx === -1) return { presets: [...content.presets, template] };
  const next = [...content.presets];
  next[idx] = template;
  return { presets: next };
}

export function deleteTemplate(content: RoomTemplatesContent, templateId: string): RoomTemplatesContent {
  return { presets: content.presets.filter((p) => p.id !== templateId) };
}

export function getTemplatesForRoomType(
  content: RoomTemplatesContent,
  roomType: string | null
): RoomTemplate[] {
  return content.presets.filter((p) => p.roomType === roomType);
}
