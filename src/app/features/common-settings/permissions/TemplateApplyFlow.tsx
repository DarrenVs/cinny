/* eslint-disable react/no-array-index-key */
import React, { useMemo, useState } from 'react';
import { Box, Button, Chip, Icon, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { Room } from 'matrix-js-sdk';
import { PermissionLocation } from '../../../hooks/usePowerLevels';
import { PowerLevelTags } from '../../../hooks/usePowerLevelTags';
import { RoomTemplate, RoomTemplatesContent } from '../../../../types/matrix/roomTemplates';
import { PowerColorBadge } from '../../../components/power';
import { getTagConflicts, isTemplateCompatible, mergeTemplateTags, templatePermissionsToMap } from '../../../utils/roomTemplates';
import { PermissionGroup } from './types';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';

type TemplateApplyFlowProps = {
  room: Room;
  permissionGroups: PermissionGroup[];
  spaceTemplates?: RoomTemplatesContent;
  accountTemplates: RoomTemplatesContent;
  onApply: (
    resolvedTags: PowerLevelTags | undefined,
    changes: Map<PermissionLocation, number>
  ) => void;
  onCancel: () => void;
};

type FlowStep = 'select' | 'conflicts';

export function TemplateApplyFlow({
  room,
  permissionGroups,
  spaceTemplates,
  accountTemplates,
  onApply,
  onCancel,
}: TemplateApplyFlowProps) {
  const [step, setStep] = useState<FlowStep>('select');
  const [selectedTemplate, setSelectedTemplate] = useState<RoomTemplate | null>(null);
  // resolutions: power -> 'template' | 'room'  (default: 'template')
  const [resolutions, setResolutions] = useState<Record<number, 'template' | 'room'>>({});

  const roomType = room.getType() ?? null;

  const matchingSpaceTemplates = useMemo(
    () => (spaceTemplates?.presets ?? []).filter((p) => isTemplateCompatible(p, roomType)),
    [spaceTemplates, roomType]
  );
  const matchingAccountTemplates = useMemo(
    () => accountTemplates.presets.filter((p) => isTemplateCompatible(p, roomType)),
    [accountTemplates, roomType]
  );

  const conflicts = useMemo(() => {
    if (!selectedTemplate?.powerLevelTags) return [];
    // Get room's current power level tags from its state events
    const tagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
    const roomTags: PowerLevelTags = tagsEvent?.getContent<PowerLevelTags>() ?? {};
    return getTagConflicts(roomTags, selectedTemplate.powerLevelTags);
  }, [selectedTemplate, room]);

  const handleSelectTemplate = (template: RoomTemplate) => {
    setSelectedTemplate(template);
    setResolutions({});

    const hasConflicts = (() => {
      if (!template.powerLevelTags) return false;
      const tagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
      const roomTags: PowerLevelTags = tagsEvent?.getContent<PowerLevelTags>() ?? {};
      return getTagConflicts(roomTags, template.powerLevelTags).length > 0;
    })();

    if (hasConflicts) {
      setStep('conflicts');
    } else {
      // No conflicts — apply directly
      applyTemplate(template, {});
    }
  };

  const applyTemplate = (template: RoomTemplate, res: Record<number, 'template' | 'room'>) => {
    const tagsEvent = room.currentState.getStateEvents('in.cinny.room.power_level_tags', '');
    const roomTags: PowerLevelTags = tagsEvent?.getContent<PowerLevelTags>() ?? {};

    const resolvedTags = template.powerLevelTags
      ? mergeTemplateTags(roomTags, template.powerLevelTags, res)
      : undefined;

    const changes = templatePermissionsToMap(template.permissions ?? {}, permissionGroups);

    onApply(resolvedTags, changes);
  };

  // ── Step: Template selector ────────────────────────────────────────────────
  if (step === 'select') {
    const hasAny = matchingSpaceTemplates.length > 0 || matchingAccountTemplates.length > 0;

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
                Apply Blueprint
              </Text>
            </Box>
          </Box>
        </PageHeader>

        <Box grow="Yes">
          <Scroll hideTrack visibility="Hover">
            <PageContent>
              <Box direction="Column" gap="500">
                <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                  Select a template to load into the permissions editor. Only templates matching this
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
                    <Text size="T200">No matching blueprints found.</Text>
                  </Box>
                )}

                {matchingSpaceTemplates.length > 0 && (
                  <Box direction="Column" gap="200">
                    <Text size="L400">Space Blueprints</Text>
                    {matchingSpaceTemplates.map((template) => (
                      <TemplateSelectCard
                        key={template.id}
                        template={template}
                        onSelect={() => handleSelectTemplate(template)}
                      />
                    ))}
                  </Box>
                )}

                {matchingAccountTemplates.length > 0 && (
                  <Box direction="Column" gap="200">
                    <Text size="L400">Account Blueprints</Text>
                    {matchingAccountTemplates.map((template) => (
                      <TemplateSelectCard
                        key={template.id}
                        template={template}
                        onSelect={() => handleSelectTemplate(template)}
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
                The template has labels that conflict with labels already in this room. Choose which
                label to keep for each conflict.
              </Text>

              <Box direction="Column" gap="300">
                {conflicts.map((conflict) => {
                  const resolution = resolutions[conflict.power] ?? 'template';
                  return (
                    <SequenceCard
                      key={conflict.power}
                      variant="SurfaceVariant"
                      className={SequenceCardStyle}
                      direction="Column"
                      gap="300"
                    >
                      <SettingTile title={`Power level ${conflict.power}`} />
                      <Box gap="200" wrap="Wrap">
                        <Chip
                          variant={resolution === 'template' ? 'Primary' : 'Secondary'}
                          radii="300"
                          before={<PowerColorBadge color={conflict.templateTag.color} />}
                          onClick={() =>
                            setResolutions((prev) => ({ ...prev, [conflict.power]: 'template' }))
                          }
                          aria-pressed={resolution === 'template'}
                        >
                          <Text size="B300">
                            {conflict.templateTag.name}{' '}
                            <Text as="span" size="T200">
                              (template)
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
                    </SequenceCard>
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
                    if (selectedTemplate) applyTemplate(selectedTemplate, resolutions);
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

// ─── Small card component for template selection ────────────────────────────────

type TemplateSelectCardProps = {
  template: RoomTemplate;
  onSelect: () => void;
};

function TemplateSelectCard({ template, onSelect }: TemplateSelectCardProps) {
  return (
    <SequenceCard
      as="button"
      variant="SurfaceVariant"
      className={SequenceCardStyle}
      direction="Column"
      gap="200"
      style={{ width: '100%', textAlign: 'left' }}
      onClick={onSelect}
    >
      <SettingTile
        before={<Icon src={Icons.File} size="200" />}
        title={template.name}
        description={template.description}
        after={
          <Box gap="100" shrink="No">
            {template.powerLevelTags && Object.keys(template.powerLevelTags).length > 0 && (
              <Box
                style={{
                  padding: '2px 10px',
                  borderRadius: '999px',
                  background: 'var(--cpd-color-bg-subtle-secondary)',
                  pointerEvents: 'none',
                }}
              >
                <Text size="T200">Labels</Text>
              </Box>
            )}
            {template.permissions && Object.keys(template.permissions).length > 0 && (
              <Box
                style={{
                  padding: '2px 10px',
                  borderRadius: '999px',
                  background: 'var(--cpd-color-bg-subtle-secondary)',
                  pointerEvents: 'none',
                }}
              >
                <Text size="T200">Permissions</Text>
              </Box>
            )}
          </Box>
        }
      />
    </SequenceCard>
  );
}
