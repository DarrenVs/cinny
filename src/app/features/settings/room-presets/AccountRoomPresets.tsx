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
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { ClickableCardStyle, SequenceCardStyle } from '../../common-settings/styles.css';

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
        initialRoomType={editingPreset === 'new' ? activeTab : undefined}
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
                    <SequenceCard
                      key={preset.id}
                      variant="SurfaceVariant"
                      className={`${SequenceCardStyle} ${ClickableCardStyle}`}
                      direction="Column"
                      gap="300"
                      tabIndex={0}
                      onClick={() => setEditingPreset(preset)}
                    >
                      <SettingTile
                        before={<Icon src={Icons.Bookmark} size="200" />}
                        title={preset.name}
                        description={preset.description}
                        after={
                          <Box gap="100" shrink="No">
                            {preset.powerLevelTags &&
                              Object.keys(preset.powerLevelTags).length > 0 && (
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
                            {preset.permissions &&
                              Object.keys(preset.permissions).length > 0 && (
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
                          Updated {new Date(preset.updatedAt).toLocaleDateString()}
                        </Text>
                        <Box gap="200" wrap="Wrap">
                          <Button
                            size="300"
                            variant="Secondary"
                            radii="300"
                            before={<Icon src={Icons.Cross} size="100" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(preset.id);
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
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
