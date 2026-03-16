/* eslint-disable react/no-array-index-key */
import React, { useMemo, useState } from 'react';
import { Box, Button, Chip, Icon, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { Room } from 'matrix-js-sdk';
import { PermissionLocation } from '../../../hooks/usePowerLevels';
import { PowerLevelTags } from '../../../hooks/usePowerLevelTags';
import { RoomPreset, RoomPresetsContent } from '../../../../types/matrix/roomPresets';
import { PowerColorBadge } from '../../../components/power';
import { getTagConflicts, mergePresetTags, presetPermissionsToMap } from '../../../utils/roomPresets';
import { PermissionGroup } from './types';

type PresetApplyFlowProps = {
  room: Room;
  permissionGroups: PermissionGroup[];
  spacePresets?: RoomPresetsContent;
  accountPresets: RoomPresetsContent;
  onApply: (
    resolvedTags: PowerLevelTags | undefined,
    changes: Map<PermissionLocation, number>
  ) => void;
  onCancel: () => void;
};

type FlowStep = 'select' | 'conflicts';

export function PresetApplyFlow({
  room,
  permissionGroups,
  spacePresets,
  accountPresets,
  onApply,
  onCancel,
}: PresetApplyFlowProps) {
  const [step, setStep] = useState<FlowStep>('select');
  const [selectedPreset, setSelectedPreset] = useState<RoomPreset | null>(null);
  // resolutions: power -> 'preset' | 'room'  (default: 'preset')
  const [resolutions, setResolutions] = useState<Record<number, 'preset' | 'room'>>({});

  const roomType = room.getType() ?? null;

  const matchingSpacePresets = useMemo(
    () => (spacePresets?.presets ?? []).filter((p) => p.roomType === roomType),
    [spacePresets, roomType]
  );
  const matchingAccountPresets = useMemo(
    () => accountPresets.presets.filter((p) => p.roomType === roomType),
    [accountPresets, roomType]
  );

  const conflicts = useMemo(() => {
    if (!selectedPreset?.powerLevelTags) return [];
    // Get room's current power level tags from its state events
    const tagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
    const roomTags: PowerLevelTags = tagsEvent?.getContent<PowerLevelTags>() ?? {};
    return getTagConflicts(roomTags, selectedPreset.powerLevelTags);
  }, [selectedPreset, room]);

  const handleSelectPreset = (preset: RoomPreset) => {
    setSelectedPreset(preset);
    setResolutions({});

    const hasConflicts = (() => {
      if (!preset.powerLevelTags) return false;
      const tagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
      const roomTags: PowerLevelTags = tagsEvent?.getContent<PowerLevelTags>() ?? {};
      return getTagConflicts(roomTags, preset.powerLevelTags).length > 0;
    })();

    if (hasConflicts) {
      setStep('conflicts');
    } else {
      // No conflicts — apply directly
      applyPreset(preset, {});
    }
  };

  const applyPreset = (preset: RoomPreset, res: Record<number, 'preset' | 'room'>) => {
    const tagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
    const roomTags: PowerLevelTags = tagsEvent?.getContent<PowerLevelTags>() ?? {};

    const resolvedTags = preset.powerLevelTags
      ? mergePresetTags(roomTags, preset.powerLevelTags, res)
      : undefined;

    const changes = presetPermissionsToMap(preset.permissions ?? {}, permissionGroups);

    onApply(resolvedTags, changes);
  };

  // ── Step: Preset selector ────────────────────────────────────────────────
  if (step === 'select') {
    const hasAny = matchingSpacePresets.length > 0 || matchingAccountPresets.length > 0;

    return (
      <Page>
        <PageHeader outlined={false}>
          <Box grow="Yes" gap="200" alignItems="Center">
            <Button
              variant="Secondary"
              fill="None"
              size="300"
              radii="300"
              before={<Icon src={Icons.ArrowLeft} size="100" />}
              onClick={onCancel}
            >
              <Text size="B300">Cancel</Text>
            </Button>
            <Box grow="Yes">
              <Text size="H3" truncate>
                Apply Preset
              </Text>
            </Box>
          </Box>
        </PageHeader>

        <Box grow="Yes">
          <Scroll hideTrack visibility="Hover">
            <PageContent>
              <Box direction="Column" gap="500">
                <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  Select a preset to load into the permissions editor. Only presets matching this
                  room type are shown.
                </Text>

                {!hasAny && (
                  <Box
                    direction="Column"
                    gap="200"
                    alignItems="Center"
                    style={{ padding: '32px', color: 'var(--cpd-color-text-secondary)' }}
                  >
                    <Icon src={Icons.Setting} size="400" />
                    <Text size="T200">No matching presets found.</Text>
                  </Box>
                )}

                {matchingSpacePresets.length > 0 && (
                  <Box direction="Column" gap="200">
                    <Text size="L400">Space Presets</Text>
                    {matchingSpacePresets.map((preset) => (
                      <PresetSelectCard
                        key={preset.id}
                        preset={preset}
                        onSelect={() => handleSelectPreset(preset)}
                      />
                    ))}
                  </Box>
                )}

                {matchingAccountPresets.length > 0 && (
                  <Box direction="Column" gap="200">
                    <Text size="L400">Account Presets</Text>
                    {matchingAccountPresets.map((preset) => (
                      <PresetSelectCard
                        key={preset.id}
                        preset={preset}
                        onSelect={() => handleSelectPreset(preset)}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            </PageContent>
          </Scroll>
        </Box>
      </Page>
    );
  }

  // ── Step: Conflict resolution ────────────────────────────────────────────
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200" alignItems="Center">
          <Button
            variant="Secondary"
            fill="None"
            size="300"
            radii="300"
            before={<Icon src={Icons.ArrowLeft} size="100" />}
            onClick={() => setStep('select')}
          >
            <Text size="B300">Back</Text>
          </Button>
          <Box grow="Yes">
            <Text size="H3" truncate>
              Resolve Label Conflicts
            </Text>
          </Box>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="500">
              <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                The preset has labels that conflict with labels already in this room. Choose which
                label to keep for each conflict.
              </Text>

              <Box direction="Column" gap="300">
                {conflicts.map((conflict) => {
                  const resolution = resolutions[conflict.power] ?? 'preset';
                  return (
                    <Box
                      key={conflict.power}
                      direction="Column"
                      gap="200"
                      style={{
                        padding: '12px',
                        border: '1px solid var(--cpd-color-border-interactive-secondary)',
                        borderRadius: '8px',
                      }}
                    >
                      <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                        Power level {conflict.power}
                      </Text>
                      <Box gap="200" wrap="Wrap">
                        <Chip
                          variant={resolution === 'preset' ? 'Primary' : 'Secondary'}
                          radii="300"
                          before={<PowerColorBadge color={conflict.presetTag.color} />}
                          onClick={() =>
                            setResolutions((prev) => ({ ...prev, [conflict.power]: 'preset' }))
                          }
                          aria-pressed={resolution === 'preset'}
                        >
                          <Text size="B300">
                            {conflict.presetTag.name}{' '}
                            <Text as="span" size="T200">
                              (preset)
                            </Text>
                          </Text>
                        </Chip>
                        <Chip
                          variant={resolution === 'room' ? 'Primary' : 'Secondary'}
                          radii="300"
                          before={<PowerColorBadge color={conflict.roomTag.color} />}
                          onClick={() =>
                            setResolutions((prev) => ({ ...prev, [conflict.power]: 'room' }))
                          }
                          aria-pressed={resolution === 'room'}
                        >
                          <Text size="B300">
                            {conflict.roomTag.name}{' '}
                            <Text as="span" size="T200">
                              (current)
                            </Text>
                          </Text>
                        </Chip>
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              <Box gap="200" justifyContent="End">
                <Button variant="Secondary" radii="300" onClick={() => setStep('select')}>
                  <Text size="B300">Back</Text>
                </Button>
                <Button
                  variant="Primary"
                  radii="300"
                  onClick={() => {
                    if (selectedPreset) applyPreset(selectedPreset, resolutions);
                  }}
                >
                  <Text size="B300">Continue</Text>
                </Button>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}

// ─── Small card component for preset selection ────────────────────────────────

type PresetSelectCardProps = {
  preset: RoomPreset;
  onSelect: () => void;
};

function PresetSelectCard({ preset, onSelect }: PresetSelectCardProps) {
  return (
    <Box
      direction="Column"
      gap="100"
      style={{
        padding: '12px',
        border: '1px solid var(--cpd-color-border-interactive-secondary)',
        borderRadius: '8px',
        cursor: 'pointer',
      }}
      onClick={onSelect}
    >
      <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
        <Text size="T300">
          <b>{preset.name}</b>
        </Text>
        <Box gap="100">
          {preset.powerLevelTags && Object.keys(preset.powerLevelTags).length > 0 && (
            <Chip variant="Secondary" radii="Pill" size="300">
              <Text size="T200">Labels</Text>
            </Chip>
          )}
          {preset.permissions && Object.keys(preset.permissions).length > 0 && (
            <Chip variant="Secondary" radii="Pill" size="300">
              <Text size="T200">Permissions</Text>
            </Chip>
          )}
        </Box>
      </Box>
      {preset.description && (
        <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
          {preset.description}
        </Text>
      )}
    </Box>
  );
}
