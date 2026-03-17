import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const SequenceCardStyle = style({
  padding: config.space.S300,
});

export const ClickableCardStyle = style({
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      backgroundColor: color.SurfaceVariant.ContainerHover,
    },
    '&:active': {
      backgroundColor: color.SurfaceVariant.ContainerActive,
    },
    '&:focus-visible': {
      backgroundColor: color.SurfaceVariant.ContainerHover,
      outline: `2px solid ${color.SurfaceVariant.ContainerLine}`,
      outlineOffset: '2px',
    },
  },
});
