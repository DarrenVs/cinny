import React, { forwardRef, MouseEventHandler, ReactNode, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Box, config, Menu, MenuItem, PopOut, RectCords, Scroll, Text, toRem } from 'folds';
import { getPowers, PowerLevelTags } from '../../hooks/usePowerLevelTags';
import { PowerColorBadge } from './PowerColorBadge';
import { stopPropagation } from '../../utils/keyboard';

/**
 * Like PowerSelector but with a "Do not change" option at the top.
 * value = undefined means "do not change".
 */
type TemplatePowerSelectorProps = {
  powerLevelTags: PowerLevelTags;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
};

export const TemplatePowerSelector = forwardRef<HTMLDivElement, TemplatePowerSelectorProps>(
  ({ powerLevelTags, value, onChange }, ref) => (
    <Menu
      ref={ref}
      style={{
        maxHeight: '75vh',
        maxWidth: toRem(300),
        display: 'flex',
      }}
    >
      <Box grow="Yes">
        <Scroll size="0" hideTrack visibility="Hover">
          <div style={{ padding: config.space.S100 }}>
            {/* "Do not change" option */}
            <MenuItem
              aria-pressed={value === undefined}
              radii="300"
              onClick={value === undefined ? undefined : () => onChange(undefined)}
              before={<PowerColorBadge color={undefined} />}
            >
              <Text style={{ flexGrow: 1 }} size="B400" truncate>
                Do not change
              </Text>
            </MenuItem>

            {getPowers(powerLevelTags).map((power) => {
              const selected = value === power;
              const tag = powerLevelTags[power];

              return (
                <MenuItem
                  key={power}
                  aria-pressed={selected}
                  radii="300"
                  onClick={selected ? undefined : () => onChange(power)}
                  before={<PowerColorBadge color={tag.color} />}
                  after={<Text size="L400">{power}</Text>}
                >
                  <Text style={{ flexGrow: 1 }} size="B400" truncate>
                    {tag.name}
                  </Text>
                </MenuItem>
              );
            })}
          </div>
        </Scroll>
      </Box>
    </Menu>
  )
);

type TemplatePowerSwitcherProps = TemplatePowerSelectorProps & {
  children: (handleOpen: MouseEventHandler<HTMLButtonElement>, opened: boolean) => ReactNode;
};

export function TemplatePowerSwitcher({
  powerLevelTags,
  value,
  onChange,
  children,
}: TemplatePowerSwitcherProps) {
  const [menuCords, setMenuCords] = useState<RectCords>();

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={menuCords}
      offset={5}
      position="Bottom"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setMenuCords(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) =>
              evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
            escapeDeactivates: stopPropagation,
          }}
        >
          <TemplatePowerSelector
            powerLevelTags={powerLevelTags}
            value={value}
            onChange={(v) => {
              onChange(v);
              setMenuCords(undefined);
            }}
          />
        </FocusTrap>
      }
    >
      {children(handleOpen, !!menuCords)}
    </PopOut>
  );
}
