/* eslint-disable react/no-array-index-key */
import React, {
  FormEventHandler,
  MouseEventHandler,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  config,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Spinner,
  Text,
  toRem,
  Tooltip,
  TooltipProvider,
} from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { HexColorPicker } from 'react-colorful';
import { Room } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import FocusTrap from 'focus-trap-react';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../../common-settings/styles.css';
import {
  getPermissionPower,
  IPowerLevels,
  PermissionLocation,
} from '../../../hooks/usePowerLevels';
import {
  DEFAULT_PRESET_TAGS,
  getPowerLevelTag,
  getPowers,
  getUsedPowers,
  PowerLevelTags,
} from '../../../hooks/usePowerLevelTags';
import { RoomType } from '../../../../types/matrix/room';
import { RoomTemplate, TemplatePermissions } from '../../../../types/matrix/roomTemplates';
import {
  createTemplate,
  getTemplatePermissionValue,
  setTemplatePermissionValue,
  updateTemplate,
} from '../../../utils/roomTemplates';
import { TemplatePowerSwitcher } from '../../../components/power/TemplatePowerSwitcher';
import { PowerColorBadge, PowerIcon } from '../../../components/power';
import { HexColorPickerPopOut } from '../../../components/HexColorPickerPopOut';
import { UseStateProvider } from '../../../components/UseStateProvider';
import { EmojiBoard } from '../../../components/emoji-board';
import { useImagePackRooms } from '../../../hooks/useImagePackRooms';
import { roomToParentsAtom } from '../../../state/room/roomToParents';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { CompactUploadCardRenderer } from '../../../components/upload-card';
import { createUploadAtom, UploadSuccess } from '../../../state/upload';
import { MemberPowerTag, MemberPowerTagIcon } from '../../../../types/matrix/room';
import { getPowerTagIconSrc } from '../../../hooks/useMemberPowerTag';
import { stopPropagation } from '../../../utils/keyboard';
import { PermissionGroup } from '../../common-settings/permissions/types';
import { usePermissionGroups as useChatPermissionGroups } from '../../room-settings/permissions/usePermissionItems';
import { usePermissionGroups as useSpacePermissionGroups } from '../../space-settings/permissions/usePermissionItems';

// ─── Room type tabs ────────────────────────────────────────────────────────────

type RoomTypeTab = { label: string; value: string | null };
const ROOM_TYPE_TABS: RoomTypeTab[] = [
  { label: 'Chat', value: null },
  { label: 'Voice', value: RoomType.Call },
  { label: 'Space', value: RoomType.Space },
];

// ─── Power level tag editor (embedded) ───────────────────────────────────────

type EditPowerTagProps = {
  maxPower?: number;
  power?: number;
  tag?: MemberPowerTag;
  contextRoom?: Room;
  onSave: (power: number, tag: MemberPowerTag) => void;
  onClose: () => void;
};

function EditPowerTag({ maxPower, power, tag, contextRoom, onSave, onClose }: EditPowerTagProps) {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const useAuthentication = useMediaAuthentication();

  const imagePackRooms = useImagePackRooms(
    contextRoom?.roomId ?? '',
    contextRoom ? roomToParents : new Map()
  );

  const [iconFile, setIconFile] = useState<File>();
  const pickFile = useFilePicker(setIconFile, false);
  const [tagColor, setTagColor] = useState<string | undefined>(tag?.color);
  const [tagIcon, setTagIcon] = useState<MemberPowerTagIcon | undefined>(tag?.icon);
  const uploadingIcon = iconFile && !tagIcon;
  const tagIconSrc = tagIcon && getPowerTagIconSrc(mx, useAuthentication, tagIcon);

  const iconUploadAtom = useMemo(() => {
    if (iconFile) return createUploadAtom(iconFile);
    return undefined;
  }, [iconFile]);

  const handleRemoveIconUpload = useCallback(() => {
    setIconFile(undefined);
  }, []);

  const handleIconUploaded = useCallback((upload: UploadSuccess) => {
    setTagIcon({ key: upload.mxc });
    setIconFile(undefined);
  }, []);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (uploadingIcon) return;
    const target = evt.target as HTMLFormElement;
    const powerInput = target.powerInput as HTMLInputElement;
    const nameInput = target.nameInput as HTMLInputElement;
    const tagPower = parseInt(powerInput.value, 10);
    if (Number.isNaN(tagPower)) return;
    const tagName = nameInput.value.trim();
    if (!tagName) return;
    onSave(power ?? tagPower, { name: tagName, color: tagColor, icon: tagIcon });
    onClose();
  };

  return (
    <Box onSubmit={handleSubmit} as="form" direction="Column" gap="400">
      <Box direction="Column" gap="300">
        <Box gap="200">
          <Box shrink="No" direction="Column" gap="100">
            <Text size="L400">Color</Text>
            <HexColorPickerPopOut
              picker={<HexColorPicker color={tagColor} onChange={setTagColor} />}
              onRemove={() => setTagColor(undefined)}
            >
              {(openPicker, opened) => (
                <Button
                  aria-pressed={opened}
                  onClick={openPicker}
                  size="300"
                  type="button"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  before={<PowerColorBadge color={tagColor} />}
                >
                  <Text size="B300">Pick</Text>
                </Button>
              )}
            </HexColorPickerPopOut>
          </Box>
          <Box grow="Yes" direction="Column" gap="100">
            <Text size="L400">Name</Text>
            <Input
              name="nameInput"
              defaultValue={tag?.name}
              placeholder="Bot"
              size="300"
              variant="Secondary"
              radii="300"
              required
            />
          </Box>
          <Box shrink="No" direction="Column" gap="100">
            <Text size="L400">Power</Text>
            <Input
              defaultValue={power}
              name="powerInput"
              size="300"
              variant={typeof power === 'number' ? 'SurfaceVariant' : 'Secondary'}
              radii="300"
              type="number"
              placeholder="75"
              outlined={typeof power === 'number'}
              readOnly={typeof power === 'number'}
              required
              style={{ maxWidth: toRem(74) }}
            />
            {typeof power !== 'number' && (
              <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                Values above 100 require room version 12+.
              </Text>
            )}
          </Box>
        </Box>
      </Box>
      {/* Icon picker */}
      {contextRoom && (
        <Box direction="Column" gap="100">
          <Text size="L400">Icon</Text>
          {iconUploadAtom && !tagIconSrc ? (
            <CompactUploadCardRenderer
              uploadAtom={iconUploadAtom}
              onRemove={handleRemoveIconUpload}
              onComplete={handleIconUploaded}
            />
          ) : (
            <Box gap="200" alignItems="Center">
              {tagIconSrc ? (
                <>
                  <PowerIcon size="500" iconSrc={tagIconSrc} />
                  <Button
                    onClick={() => setTagIcon(undefined)}
                    type="button"
                    size="300"
                    variant="Critical"
                    fill="None"
                    radii="300"
                  >
                    <Text size="B300">Remove</Text>
                  </Button>
                </>
              ) : (
                <>
                  <UseStateProvider initial={undefined}>
                    {(cords: RectCords | undefined, setCords) => (
                      <PopOut
                        position="Bottom"
                        anchor={cords}
                        content={
                          <EmojiBoard
                            imagePackRooms={imagePackRooms}
                            returnFocusOnDeactivate={false}
                            allowTextCustomEmoji={false}
                            addToRecentEmoji={false}
                            onEmojiSelect={(key) => {
                              setTagIcon({ key });
                              setCords(undefined);
                            }}
                            onCustomEmojiSelect={(mxc) => {
                              setTagIcon({ key: mxc });
                              setCords(undefined);
                            }}
                            requestClose={() => setCords(undefined)}
                          />
                        }
                      >
                        <Button
                          onClick={
                            ((evt) =>
                              setCords(
                                evt.currentTarget.getBoundingClientRect()
                              )) as MouseEventHandler<HTMLButtonElement>
                          }
                          type="button"
                          size="300"
                          variant="Secondary"
                          fill="Soft"
                          radii="300"
                          before={<Icon size="50" src={Icons.SmilePlus} />}
                        >
                          <Text size="B300">Pick</Text>
                        </Button>
                      </PopOut>
                    )}
                  </UseStateProvider>
                  <Button
                    onClick={() => pickFile('image/*')}
                    type="button"
                    size="300"
                    variant="Secondary"
                    fill="None"
                    radii="300"
                  >
                    <Text size="B300">Import</Text>
                  </Button>
                </>
              )}
            </Box>
          )}
        </Box>
      )}
      <Box direction="Row" gap="200" justifyContent="Start">
        <Button
          style={{ minWidth: toRem(64) }}
          type="submit"
          size="300"
          variant="Success"
          radii="300"
          disabled={uploadingIcon}
        >
          <Text size="B300">Save</Text>
        </Button>
        <Button
          type="button"
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="300"
          onClick={onClose}
        >
          <Text size="B300">Cancel</Text>
        </Button>
      </Box>
    </Box>
  );
}

// ─── Power levels editor sub-page ─────────────────────────────────────────────

type TemplatePowerLevelsEditorProps = {
  powerLevelTags: PowerLevelTags;
  permissions: TemplatePermissions;
  contextRoom?: Room;
  onChangeTags: (tags: PowerLevelTags) => void;
  requestClose: () => void;
};

function TemplatePowerLevelsEditor({
  powerLevelTags,
  permissions,
  contextRoom,
  onChangeTags,
  requestClose,
}: TemplatePowerLevelsEditorProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const usedPowers = useMemo(() => getUsedPowers(permissions as unknown as IPowerLevels), [permissions]);

  const [editedTags, setEditedTags] = useState<PowerLevelTags>({ ...powerLevelTags });
  const [deleted, setDeleted] = useState<Set<number>>(new Set());
  const [createTag, setCreateTag] = useState(false);

  const handleToggleDelete = (power: number) => {
    setDeleted((prev) => {
      const next = new Set(prev);
      if (next.has(power)) next.delete(power);
      else next.add(power);
      return next;
    });
  };

  const handleSaveTag = (power: number, tag: MemberPowerTag) => {
    setEditedTags((prev) => ({ ...prev, [power]: tag }));
  };

  const handleApply = () => {
    const final = { ...editedTags };
    deleted.forEach((p) => delete final[p]);
    onChangeTags(final);
    requestClose();
  };

  const hasChanges = Object.keys(editedTags).length !== Object.keys(powerLevelTags).length ||
    deleted.size > 0 ||
    Object.entries(editedTags).some(([k, v]) => {
      const orig = powerLevelTags[Number(k)];
      return !orig || orig.name !== v.name || orig.color !== v.color || orig.icon?.key !== v.icon?.key;
    });

  return (
    <Page>
      <PageHeader outlined={false} balance>
        <Box alignItems="Center" grow="Yes" gap="200">
          <Box alignItems="Inherit" grow="Yes" gap="200">
            <Chip
              size="500"
              radii="Pill"
              onClick={requestClose}
              before={<Icon size="100" src={Icons.ArrowLeft} />}
            >
              <Text size="T300">Back</Text>
            </Chip>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Power Levels</Text>
                <SequenceCard
                  variant="SurfaceVariant"
                  className={SequenceCardStyle}
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="New Power Level"
                    description="Create a new power level label."
                    after={
                      !createTag && (
                        <Button
                          onClick={() => setCreateTag(true)}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                        >
                          <Text size="B300">Create</Text>
                        </Button>
                      )
                    }
                  />
                  {createTag && (
                    <EditPowerTag
                      contextRoom={contextRoom}
                      onSave={handleSaveTag}
                      onClose={() => setCreateTag(false)}
                    />
                  )}
                </SequenceCard>
                {getPowers(editedTags).map((power) => {
                  const tag = editedTags[power];
                  const tagIconSrc = tag.icon && getPowerTagIconSrc(mx, useAuthentication, tag.icon);
                  return (
                    <SequenceCard
                      key={power}
                      variant={deleted.has(power) ? 'Critical' : 'SurfaceVariant'}
                      className={SequenceCardStyle}
                      direction="Column"
                      gap="400"
                    >
                      <UseStateProvider initial={false}>
                        {(edit: boolean, setEdit: (v: boolean) => void) =>
                          edit ? (
                            <EditPowerTag
                              power={power}
                              tag={tag}
                              contextRoom={contextRoom}
                              onSave={handleSaveTag}
                              onClose={() => setEdit(false)}
                            />
                          ) : (
                            <SettingTile
                              before={<PowerColorBadge color={tag.color} />}
                              title={
                                <Box as="span" alignItems="Center" gap="200">
                                  <b>{deleted.has(power) ? <s>{tag.name}</s> : tag.name}</b>
                                  <Box as="span" shrink="No" alignItems="Inherit" gap="Inherit">
                                    {tagIconSrc && <PowerIcon size="50" iconSrc={tagIconSrc} />}
                                    <Text as="span" size="T200" priority="300">
                                      ({power})
                                    </Text>
                                  </Box>
                                </Box>
                              }
                              after={
                                deleted.has(power) ? (
                                  <Chip
                                    variant="Critical"
                                    radii="Pill"
                                    onClick={() => handleToggleDelete(power)}
                                  >
                                    <Text size="B300">Undo</Text>
                                  </Chip>
                                ) : (
                                  <Box shrink="No" alignItems="Center" gap="200">
                                    <TooltipProvider
                                      tooltip={
                                        <Tooltip style={{ maxWidth: toRem(200) }}>
                                          {usedPowers.has(power) ? (
                                            <Box direction="Column">
                                              <Text size="L400">Used Power Level</Text>
                                              <Text size="T200">
                                                Remove its use before deleting.
                                              </Text>
                                            </Box>
                                          ) : (
                                            <Text>Delete</Text>
                                          )}
                                        </Tooltip>
                                      }
                                    >
                                      {(triggerRef) => (
                                        <Chip
                                          ref={triggerRef}
                                          variant="Secondary"
                                          fill="None"
                                          radii="Pill"
                                          aria-disabled={usedPowers.has(power)}
                                          onClick={
                                            usedPowers.has(power)
                                              ? undefined
                                              : () => handleToggleDelete(power)
                                          }
                                        >
                                          <Icon size="50" src={Icons.Delete} />
                                        </Chip>
                                      )}
                                    </TooltipProvider>
                                    <Chip
                                      variant="Secondary"
                                      radii="Pill"
                                      onClick={() => setEdit(true)}
                                    >
                                      <Text size="B300">Edit</Text>
                                    </Chip>
                                  </Box>
                                )
                              }
                            />
                          )
                        }
                      </UseStateProvider>
                    </SequenceCard>
                  );
                })}
              </Box>
              {hasChanges && (
                <Menu
                  style={{
                    position: 'sticky',
                    padding: config.space.S200,
                    paddingLeft: config.space.S400,
                    bottom: config.space.S400,
                    left: config.space.S400,
                    right: 0,
                    zIndex: 1,
                  }}
                  variant="Success"
                >
                  <Box alignItems="Center" gap="400">
                    <Box grow="Yes">
                      <Text size="T200">
                        <b>Labels changed. Apply to save them to the blueprint.</b>
                      </Text>
                    </Box>
                    <Button
                      size="300"
                      variant="Success"
                      radii="300"
                      onClick={handleApply}
                    >
                      <Text size="B300">Apply</Text>
                    </Button>
                  </Box>
                </Menu>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}

// ─── Template power levels display (like Powers.tsx but on local state) ─────────

type TemplatePowersProps = {
  powerLevelTags: PowerLevelTags;
  permissionGroups: PermissionGroup[];
  onEdit: () => void;
};

function TemplatePowers({ powerLevelTags, permissionGroups, onEdit }: TemplatePowersProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  return (
    <Box direction="Column" gap="100">
      <SequenceCard
        variant="SurfaceVariant"
        className={SequenceCardStyle}
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Power Levels"
          description="Manage and customize power level labels for this template."
          after={
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              onClick={onEdit}
            >
              <Text size="B300">Edit</Text>
            </Button>
          }
        />
        <SettingTile>
          <Box gap="200" wrap="Wrap">
            {getPowers(powerLevelTags).length === 0 ? (
              <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                No labels defined — click Edit to add power level labels.
              </Text>
            ) : (
              getPowers(powerLevelTags).map((power) => {
                const tag = powerLevelTags[power];
                const tagIconSrc = tag.icon && getPowerTagIconSrc(mx, useAuthentication, tag.icon);
                return (
                  <Chip
                    key={power}
                    variant="Secondary"
                    radii="300"
                    before={<PowerColorBadge color={tag.color} />}
                    after={tagIconSrc && <PowerIcon size="50" iconSrc={tagIconSrc} />}
                  >
                    <Text size="T300" truncate>
                      <b>{tag.name}</b>
                    </Text>
                  </Chip>
                );
              })
            )}
          </Box>
        </SettingTile>
      </SequenceCard>
    </Box>
  );
}

// ─── Permission groups rendering ──────────────────────────────────────────────

type TemplatePermissionGroupsProps = {
  permissions: TemplatePermissions;
  powerLevelTags: PowerLevelTags;
  permissionGroups: PermissionGroup[];
  onChange: (permissions: TemplatePermissions) => void;
};

function TemplatePermissionGroups({
  permissions,
  powerLevelTags,
  permissionGroups,
  onChange,
}: TemplatePermissionGroupsProps) {
  const maxPower = useMemo(
    () => (getPowers(powerLevelTags).length > 0 ? Math.max(...getPowers(powerLevelTags)) : 100),
    [powerLevelTags]
  );

  const handleChange = (location: PermissionLocation, value: number | undefined) => {
    onChange(setTemplatePermissionValue(permissions, location, value));
  };

  const userDefaultLocation: PermissionLocation = { user: true } as PermissionLocation;
  const userDefaultValue = getTemplatePermissionValue(permissions, userDefaultLocation);

  return (
    <>
      {/* Users section */}
      <Box direction="Column" gap="100">
        <Text size="L400">Users</Text>
        <SequenceCard
          variant="SurfaceVariant"
          className={SequenceCardStyle}
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="Default Power"
            description="Default power level for all users."
            after={
              <TemplatePowerSwitcher
                powerLevelTags={powerLevelTags}
                value={userDefaultValue}
                onChange={(v) => handleChange(userDefaultLocation, v)}
              >
                {(handleOpen, opened) => (
                  <Chip
                    variant={userDefaultValue !== undefined ? 'Success' : 'Secondary'}
                    outlined={userDefaultValue !== undefined}
                    fill="Soft"
                    radii="Pill"
                    aria-selected={opened}
                    after={
                      userDefaultValue !== undefined && (
                        <Badge size="200" variant="Success" fill="Solid" radii="Pill" />
                      )
                    }
                    before={<Icon size="50" src={opened ? Icons.ChevronTop : Icons.ChevronBottom} />}
                    onClick={handleOpen}
                  >
                    <Text size="B300" truncate>
                      {userDefaultValue !== undefined
                        ? getPowerLevelTag(powerLevelTags, userDefaultValue).name
                        : 'Do not change'}
                    </Text>
                  </Chip>
                )}
              </TemplatePowerSwitcher>
            }
          />
        </SequenceCard>
      </Box>

      {/* Permission groups */}
      {permissionGroups.map((group, groupIndex) => (
        <Box key={groupIndex} direction="Column" gap="100">
          <Text size="L400">{group.name}</Text>
          {group.items.map((item, itemIndex) => {
            const value = getTemplatePermissionValue(permissions, item.location);
            const isSet = value !== undefined;

            return (
              <SequenceCard
                key={itemIndex}
                variant="SurfaceVariant"
                className={SequenceCardStyle}
                direction="Column"
                gap="400"
              >
                <SettingTile
                  title={item.name}
                  description={item.description}
                  after={
                    <TemplatePowerSwitcher
                      powerLevelTags={powerLevelTags}
                      value={value}
                      onChange={(v) => handleChange(item.location, v)}
                    >
                      {(handleOpen, opened) => (
                        <Chip
                          variant={isSet ? 'Success' : 'Secondary'}
                          outlined={isSet}
                          fill="Soft"
                          radii="Pill"
                          aria-selected={opened}
                          after={
                            isSet && (
                              <Badge size="200" variant="Success" fill="Solid" radii="Pill" />
                            )
                          }
                          before={
                            <Icon
                              size="50"
                              src={opened ? Icons.ChevronTop : Icons.ChevronBottom}
                            />
                          }
                          onClick={handleOpen}
                        >
                          <Text size="B300" truncate>
                            {isSet
                              ? getPowerLevelTag(powerLevelTags, value!).name
                              : 'Do not change'}
                          </Text>
                          {isSet && value! < maxPower && (
                            <Text size="T200">{'& Above'}</Text>
                          )}
                        </Chip>
                      )}
                    </TemplatePowerSwitcher>
                  }
                />
              </SequenceCard>
            );
          })}
        </Box>
      ))}
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type TemplatePermissionsEditorProps = {
  existing?: RoomTemplate;
  initialRoomType?: string | null;
  contextRoom?: Room;
  onSave: (template: RoomTemplate) => void;
  onCancel: () => void;
  /** When provided, shows a "Save to Account" chip in the header. */
  onSaveToAccount?: (template: RoomTemplate) => void;
  /** When provided, shows an "Apply Blueprint" chip to load settings from another template. */
  availableTemplates?: RoomTemplate[];
};

export function TemplatePermissionsEditor({
  existing,
  initialRoomType,
  contextRoom,
  onSave,
  onCancel,
  onSaveToAccount,
  availableTemplates,
}: TemplatePermissionsEditorProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [roomType, setRoomType] = useState<string | null>(
    existing?.roomType ?? initialRoomType ?? null
  );
  const [powerLevelTags, setPowerLevelTags] = useState<PowerLevelTags>(
    existing?.powerLevelTags ?? DEFAULT_PRESET_TAGS
  );
  const [permissions, setPermissions] = useState<TemplatePermissions>(existing?.permissions ?? {});
  const [showPowerEditor, setShowPowerEditor] = useState(false);
  const [templatePickerCords, setTemplatePickerCords] = useState<RectCords | undefined>();

  const chatGroups = useChatPermissionGroups(false);
  const voiceGroups = useChatPermissionGroups(true);
  const spaceGroups = useSpacePermissionGroups();

  const permissionGroups = useMemo(() => {
    if (roomType === RoomType.Space) return spaceGroups;
    if (roomType === RoomType.Call) return voiceGroups;
    return chatGroups;
  }, [roomType, chatGroups, voiceGroups, spaceGroups]);

  const hasChanges = useMemo(() => {
    if (!existing) return name.trim().length > 0;
    if (name.trim() !== existing.name.trim()) return true;
    if ((description.trim() || undefined) !== existing.description) return true;
    if (roomType !== existing.roomType) return true;
    if (
      JSON.stringify(powerLevelTags) !==
      JSON.stringify(existing.powerLevelTags ?? DEFAULT_PRESET_TAGS)
    )
      return true;
    if (JSON.stringify(permissions) !== JSON.stringify(existing.permissions ?? {})) return true;
    return false;
  }, [name, description, roomType, powerLevelTags, permissions, existing]);

  const handleLoadTemplate = useCallback(
    (source: RoomTemplate) => {
      setPowerLevelTags(source.powerLevelTags ?? DEFAULT_PRESET_TAGS);
      setPermissions(source.permissions ?? {});
      setTemplatePickerCords(undefined);
    },
    []
  );

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const template = existing
      ? updateTemplate(existing, {
          name: trimmedName,
          description: description.trim() || undefined,
          roomType,
          powerLevelTags: Object.keys(powerLevelTags).length > 0 ? powerLevelTags : undefined,
          permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        })
      : createTemplate({
          name: trimmedName,
          description: description.trim() || undefined,
          roomType,
          powerLevelTags: Object.keys(powerLevelTags).length > 0 ? powerLevelTags : undefined,
          permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        });

    onSave(template);
  };

  if (showPowerEditor) {
    return (
      <TemplatePowerLevelsEditor
        powerLevelTags={powerLevelTags}
        permissions={permissions}
        contextRoom={contextRoom}
        onChangeTags={(tags) => {
          setPowerLevelTags(tags);
          setShowPowerEditor(false);
        }}
        requestClose={() => setShowPowerEditor(false)}
      />
    );
  }

  const buildCurrentTemplate = (): RoomTemplate | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    return existing
      ? updateTemplate(existing, {
          name: trimmedName,
          description: description.trim() || undefined,
          roomType,
          powerLevelTags: Object.keys(powerLevelTags).length > 0 ? powerLevelTags : undefined,
          permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        })
      : createTemplate({
          name: trimmedName,
          description: description.trim() || undefined,
          roomType,
          powerLevelTags: Object.keys(powerLevelTags).length > 0 ? powerLevelTags : undefined,
          permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        });
  };

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200" alignItems="Center">
          <IconButton onClick={onCancel} variant="Surface" aria-label="Back">
            <Icon src={Icons.ArrowLeft} />
          </IconButton>
          <Box grow="Yes">
            <Text size="H3" truncate>
              {existing ? 'Edit Blueprint' : 'New Blueprint'}
            </Text>
          </Box>
          <Box shrink="No" gap="200" alignItems="Center">
            {availableTemplates && availableTemplates.length > 0 && (
              <PopOut
                anchor={templatePickerCords}
                position="Bottom"
                align="End"
                offset={4}
                content={
                  <FocusTrap
                    focusTrapOptions={{
                      initialFocus: false,
                      onDeactivate: () => setTemplatePickerCords(undefined),
                      clickOutsideDeactivates: true,
                      escapeDeactivates: stopPropagation,
                    }}
                  >
                    <Menu>
                      <Box
                        direction="Column"
                        gap="100"
                        style={{ padding: config.space.S100, maxWidth: toRem(220) }}
                      >
                        {availableTemplates.map((t) => (
                          <MenuItem
                            key={t.id}
                            variant="Surface"
                            fill="None"
                            size="300"
                            radii="300"
                            before={<Icon src={Icons.File} size="50" />}
                            onClick={() => handleLoadTemplate(t)}
                          >
                            <Text size="B300" truncate>
                              {t.name}
                            </Text>
                          </MenuItem>
                        ))}
                      </Box>
                    </Menu>
                  </FocusTrap>
                }
              >
                <Chip
                  variant="Secondary"
                  fill="Soft"
                  radii="Pill"
                  before={<Icon src={Icons.File} size="50" />}
                  onClick={(e) =>
                    setTemplatePickerCords(e.currentTarget.getBoundingClientRect())
                  }
                  aria-pressed={!!templatePickerCords}
                >
                  <Text size="B300">Apply Blueprint</Text>
                </Chip>
              </PopOut>
            )}
            {onSaveToAccount && (
              <Chip
                variant="Secondary"
                fill="Soft"
                radii="Pill"
                before={<Icon src={Icons.ArrowGoRight} size="50" />}
                onClick={() => {
                  const template = buildCurrentTemplate();
                  if (template) onSaveToAccount(template);
                }}
                disabled={!name.trim()}
              >
                <Text size="B300">Save to Account</Text>
              </Chip>
            )}
            <IconButton onClick={onCancel} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              {/* Name, room type and description */}
              <Box direction="Column" gap="300">
                <Box direction="Column" gap="100">
                  <Text size="L400">Name</Text>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Standard Chat"
                    size="400"
                    variant="Secondary"
                    radii="300"
                  />
                </Box>
                <Box direction="Column" gap="100">
                  <Text size="L400">Room Type</Text>
                  <Box gap="200">
                    {ROOM_TYPE_TABS.map((tab) => (
                      <Chip
                        key={tab.label}
                        variant={roomType === tab.value ? 'Primary' : 'Secondary'}
                        onClick={() => setRoomType(tab.value)}
                        aria-pressed={roomType === tab.value}
                        radii="Pill"
                      >
                        <Text size="B300">{tab.label}</Text>
                      </Chip>
                    ))}
                  </Box>
                </Box>
                <Box direction="Column" gap="100">
                  <Text size="L400">Description (optional)</Text>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A description of this template"
                    size="300"
                    variant="Secondary"
                    radii="300"
                  />
                </Box>
              </Box>

              {/* Power Levels section */}
              <TemplatePowers
                powerLevelTags={powerLevelTags}
                permissionGroups={permissionGroups}
                onEdit={() => setShowPowerEditor(true)}
              />

              {/* Permission groups */}
              <TemplatePermissionGroups
                permissions={permissions}
                powerLevelTags={powerLevelTags}
                permissionGroups={permissionGroups}
                onChange={setPermissions}
              />

              {/* Save button — only shown when there are unsaved changes */}
              {hasChanges && (
                <Menu
                  style={{
                    position: 'sticky',
                    padding: config.space.S200,
                    paddingLeft: config.space.S400,
                    bottom: config.space.S400,
                    left: config.space.S400,
                    right: 0,
                    zIndex: 1,
                  }}
                  variant="Success"
                >
                  <Box alignItems="Center" gap="400">
                    <Box grow="Yes">
                      <Text size="T200">
                        Permissions set to &quot;Do not change&quot; will not alter rooms when
                        applied.
                      </Text>
                    </Box>
                    <Box shrink="No" gap="200">
                      <Button
                        size="300"
                        variant="Success"
                        fill="None"
                        radii="300"
                        onClick={onCancel}
                      >
                        <Text size="B300">Cancel</Text>
                      </Button>
                      <Button
                        size="300"
                        variant="Success"
                        radii="300"
                        disabled={!name.trim()}
                        onClick={handleSave}
                      >
                        <Text size="B300">Save Blueprint</Text>
                      </Button>
                    </Box>
                  </Box>
                </Menu>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
