import { IPowerLevels } from '../../app/hooks/usePowerLevels';
import { PowerLevelTags } from '../../app/hooks/usePowerLevelTags';

/**
 * Sparse power level permissions stored in a template.
 * Keys absent from this object mean "do not change" for that permission.
 * Mirrors IPowerLevels but all fields are optional — only explicitly
 * configured permissions are stored.
 */
export type TemplatePermissions = {
  users_default?: number;
  events_default?: number;
  state_default?: number;
  invite?: number;
  kick?: number;
  ban?: number;
  redact?: number;
  historical?: number;
  events?: Record<string, number>;
  notifications?: Record<string, number>;
};

export type RoomTemplate = {
  id: string;
  name: string;
  description?: string;
  /** null = chat room, RoomType.Call = voice room, RoomType.Space = space */
  roomType: string | null;
  /** Power level labels defined in this template */
  powerLevelTags?: PowerLevelTags;
  /** Sparse permissions — absent keys are left unchanged when template is applied */
  permissions?: TemplatePermissions;
  createdAt: number;
  updatedAt: number;
};

export type RoomTemplatesContent = {
  presets: RoomTemplate[];
};

export type TemplateApplicationStatus =
  | 'in-sync'       // room permissions already match template
  | 'needs-sync'    // room differs from template
  | 'no-permission' // user cannot modify this room
  | 'type-mismatch'; // room type does not match template type
