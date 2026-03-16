import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Chip, Icon, IconButton, Icons, Scroll, Text } from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useAccountRoomPresets } from '../../../hooks/useAccountRoomPresets';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { RoomType } from '../../../../types/matrix/room';
import { RoomPreset, RoomPresetsContent } from '../../../../types/matrix/roomPresets';
import {
  savePreset,
  deletePreset,
  getPresetsForRoomType,
} from '../../../utils/roomPresets';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { PresetPermissionsEditor } from '../../space-settings/room-presets/PresetPermissionsEditor';

type RoomTypeTab = { label: string; value: string | null };

const ROOM_TYPE_TABS: RoomTypeTab[] = [
  { label: 'Chat', value: null },
  { label: 'Voice', value: RoomType.Call },
  { label: 'Space', value: RoomType.Space },
];

type AccountRoomPresetsProps = {
  requestClose: () => void;
};

export function AccountRoomPresets({ requestClose }: AccountRoomPresetsProps) {
  const mx = useMatrixClient();
  const accountPresets = useAccountRoomPresets();

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<RoomPreset | null | 'new'>(null);

  const savePresetsToAccount = useCallback(
    async (content: RoomPresetsContent) => {
      await mx.setAccountData(AccountDataEvent.RoomPresets as any, content as any);
    },
    [mx]
  );

  const [, handleSavePreset] = useAsyncCallback(
    useCallback(
      async (preset: RoomPreset) => {
        const updated = savePreset(accountPresets, preset);
        await savePresetsToAccount(updated);
        setEditingPreset(null);
      },
      [accountPresets, savePresetsToAccount]
    )
  );

  const [deleteState, handleDeletePreset] = useAsyncCallback(
    useCallback(
      async (presetId: string) => {
        const updated = deletePreset(accountPresets, presetId);
        await savePresetsToAccount(updated);
      },
      [accountPresets, savePresetsToAccount]
    )
  );

  const currentTabPresets = useMemo(
    () => getPresetsForRoomType(accountPresets, activeTab),
    [accountPresets, activeTab]
  );

  // ── Editing preset ──────────────────────────────────────────────────────────
  if (editingPreset !== null) {
    return (
      <PresetPermissionsEditor
        existing={editingPreset === 'new' ? undefined : editingPreset}
        // No contextRoom in account settings — emoji picker disabled
        onSave={(preset) => handleSavePreset(preset)}
        onCancel={() => setEditingPreset(null)}
      />
    );
  }

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200" alignItems="Center">
          <Box grow="Yes" alignItems="Center">
            <Text size="H3" truncate>
              Room Presets
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
                Your personal preset library. Presets here can be pushed into any space you manage.
              </Text>

              {/* Room type tabs */}
              <Box gap="200" wrap="Wrap">
                {ROOM_TYPE_TABS.map((tab) => (
                  <Chip
                    key={tab.label}
                    variant={activeTab === tab.value ? 'Primary' : 'Secondary'}
                    onClick={() => setActiveTab(tab.value)}
                    aria-pressed={activeTab === tab.value}
                    radii="Pill"
                  >
                    <Text size="B300">{tab.label}</Text>
                  </Chip>
                ))}
              </Box>

              {/* Create button */}
              <Box gap="200" wrap="Wrap">
                <Button
                  size="300"
                  variant="Primary"
                  radii="300"
                  before={<Icon src={Icons.Plus} size="100" />}
                  onClick={() => setEditingPreset('new')}
                >
                  <Text size="B300">New Preset</Text>
                </Button>
              </Box>

              {/* Preset list */}
              {currentTabPresets.length === 0 ? (
                <Box
                  direction="Column"
                  gap="200"
                  alignItems="Center"
                  style={{ padding: '32px', color: 'var(--cpd-color-text-secondary)' }}
                >
                  <Icon src={Icons.Setting} size="400" />
                  <Text size="T200">No presets for this room type yet.</Text>
                  <Button
                    size="300"
                    variant="Secondary"
                    radii="300"
                    before={<Icon src={Icons.Plus} size="100" />}
                    onClick={() => setEditingPreset('new')}
                  >
                    <Text size="B300">Create one</Text>
                  </Button>
                </Box>
              ) : (
                <Box direction="Column" gap="300">
                  {currentTabPresets.map((preset) => (
                    <Box
                      key={preset.id}
                      direction="Column"
                      gap="200"
                      style={{
                        padding: '16px',
                        border: '1px solid var(--cpd-color-border-interactive-secondary)',
                        borderRadius: '8px',
                      }}
                    >
                      <Box gap="200" alignItems="Center" justifyContent="SpaceBetween">
                        <Box direction="Column">
                          <Text size="T300">
                            <b>{preset.name}</b>
                          </Text>
                          {preset.description && (
                            <Text
                              size="T200"
                              style={{ color: 'var(--cpd-color-text-secondary)' }}
                            >
                              {preset.description}
                            </Text>
                          )}
                        </Box>
                        <Box gap="100">
                          {preset.powerLevelTags &&
                            Object.keys(preset.powerLevelTags).length > 0 && (
                              <Chip variant="Secondary" radii="Pill" size="300">
                                <Text size="T200">Labels</Text>
                              </Chip>
                            )}
                          {preset.permissions &&
                            Object.keys(preset.permissions).length > 0 && (
                              <Chip variant="Secondary" radii="Pill" size="300">
                                <Text size="T200">Permissions</Text>
                              </Chip>
                            )}
                        </Box>
                      </Box>

                      <Text size="T200" style={{ color: 'var(--cpd-color-text-secondary)' }}>
                        Updated {new Date(preset.updatedAt).toLocaleDateString()}
                      </Text>

                      <Box gap="200" wrap="Wrap">
                        <Button
                          size="300"
                          variant="Secondary"
                          radii="300"
                          before={<Icon src={Icons.Pencil} size="100" />}
                          onClick={() => setEditingPreset(preset)}
                        >
                          <Text size="B300">Edit</Text>
                        </Button>
                        <Button
                          size="300"
                          variant="Secondary"
                          radii="300"
                          before={<Icon src={Icons.Cross} size="100" />}
                          onClick={() => handleDeletePreset(preset.id)}
                          disabled={deleteState.status === AsyncStatus.Loading}
                        >
                          <Text size="B300">Delete</Text>
                        </Button>
                      </Box>
                    </Box>
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
