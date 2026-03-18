import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Chip, Icon, IconButton, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useAccountRoomTemplates } from '../../../hooks/useAccountRoomTemplates';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { RoomType } from '../../../../types/matrix/room';
import { RoomTemplate, RoomTemplatesContent } from '../../../../types/matrix/roomTemplates';
import {
  saveTemplate,
  deleteTemplate,
  getTemplatesForRoomType,
} from '../../../utils/roomTemplates';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { TemplatePermissionsEditor } from '../../space-settings/room-templates/TemplatePermissionsEditor';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { ClickableCardStyle, SequenceCardStyle } from '../../common-settings/styles.css';

type RoomTypeTab = { label: string; value: string | null };

const ROOM_TYPE_TABS: RoomTypeTab[] = [
  { label: 'Chat', value: null },
  { label: 'Voice', value: RoomType.Call },
  { label: 'Space', value: RoomType.Space },
];

type AccountRoomTemplatesProps = {
  requestClose: () => void;
};

export function AccountRoomTemplates({ requestClose }: AccountRoomTemplatesProps) {
  const mx = useMatrixClient();
  const accountTemplates = useAccountRoomTemplates();

  const [editingTemplate, setEditingTemplate] = useState<RoomTemplate | null | 'new'>(null);

  const saveTemplatesToAccount = useCallback(
    async (content: RoomTemplatesContent) => {
      await mx.setAccountData(AccountDataEvent.RoomTemplates as any, content as any);
    },
    [mx]
  );

  const [, handleSaveTemplate] = useAsyncCallback(
    useCallback(
      async (template: RoomTemplate) => {
        const updated = saveTemplate(accountTemplates, template);
        await saveTemplatesToAccount(updated);
        setEditingTemplate(null);
      },
      [accountTemplates, saveTemplatesToAccount]
    )
  );

  const [deleteState, handleDeleteTemplate] = useAsyncCallback(
    useCallback(
      async (templateId: string) => {
        const updated = deleteTemplate(accountTemplates, templateId);
        await saveTemplatesToAccount(updated);
      },
      [accountTemplates, saveTemplatesToAccount]
    )
  );

  const templateSections = useMemo(
    () =>
      ROOM_TYPE_TABS.map((tab) => ({
        ...tab,
        templates: getTemplatesForRoomType(accountTemplates, tab.value),
      })).filter((s) => s.templates.length > 0),
    [accountTemplates]
  );

  // ── Editing template ──────────────────────────────────────────────────────────
  if (editingTemplate !== null) {
    return (
      <TemplatePermissionsEditor
        existing={editingTemplate === 'new' ? undefined : editingTemplate}
        initialRoomType={undefined}
        // No contextRoom in account settings — emoji picker disabled
        onSave={(template) => handleSaveTemplate(template)}
        onCancel={() => setEditingTemplate(null)}
        availableTemplates={accountTemplates.presets.filter(
          (t) => t.id !== (editingTemplate !== 'new' ? editingTemplate?.id : undefined)
        )}
      />
    );
  }

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200" alignItems="Center">
          <Box grow="Yes" alignItems="Center">
            <Text size="H3" truncate>
              Blueprints
            </Text>
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
            <Box direction="Column" gap="500">
              <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                Your personal template library. Templates here can be pushed into any space you manage.
              </Text>

              {/* Create button */}
              <Box gap="200" wrap="Wrap">
                <Button
                  size="300"
                  variant="Primary"
                  radii="300"
                  before={<Icon src={Icons.Plus} size="100" />}
                  onClick={() => setEditingTemplate('new')}
                >
                  <Text size="B300">New Blueprint</Text>
                </Button>
              </Box>

              {/* Empty state */}
              {templateSections.length === 0 && (
                <Box
                  direction="Column"
                  gap="200"
                  alignItems="Center"
                  style={{ padding: '32px', color: 'var(--cpd-color-text-secondary)' }}
                >
                  <Icon src={Icons.Setting} size="400" />
                  <Text size="T200">No blueprints yet.</Text>
                  <Button
                    size="300"
                    variant="Secondary"
                    radii="300"
                    before={<Icon src={Icons.Plus} size="100" />}
                    onClick={() => setEditingTemplate('new')}
                  >
                    <Text size="B300">Create one</Text>
                  </Button>
                </Box>
              )}

              {/* Grouped sections */}
              {templateSections.map((section) => (
                <Box key={section.label} direction="Column" gap="300">
                  <Text size="L400">{section.label}</Text>
                  <Box direction="Column" gap="300">
                  {section.templates.map((template) => (
                    <SequenceCard
                      key={template.id}
                      variant="SurfaceVariant"
                      className={`${SequenceCardStyle} ${ClickableCardStyle}`}
                      direction="Column"
                      gap="300"
                      tabIndex={0}
                      onClick={() => setEditingTemplate(template)}
                    >
                      <SettingTile
                        before={<Icon src={Icons.File} size="200" />}
                        title={template.name}
                        description={template.description}
                        after={
                          <Box gap="100" shrink="No">
                            {template.powerLevelTags &&
                              Object.keys(template.powerLevelTags).length > 0 && (
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
                            {template.permissions &&
                              Object.keys(template.permissions).length > 0 && (
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
                      <Box gap="200" alignItems="Center" justifyContent="SpaceBetween" wrap="Wrap">
                        <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                          Updated {new Date(template.updatedAt).toLocaleDateString()}
                        </Text>
                        <Box gap="200" wrap="Wrap">
                          <Button
                            size="300"
                            variant="Secondary"
                            radii="300"
                            before={<Icon src={Icons.Cross} size="100" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(template.id);
                            }}
                            disabled={deleteState.status === AsyncStatus.Loading}
                          >
                            <Text size="B300">Delete</Text>
                          </Button>
                        </Box>
                      </Box>
                    </SequenceCard>
                  ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
