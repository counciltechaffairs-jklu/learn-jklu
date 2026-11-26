// Stageshow core kit exports (adapted for Next.js Pages Router global CSS imports).

export { Stage } from './stage';
export { useLook } from './looks';
export { useReducedMotion } from './reduced-motion';
export { inset, box, between, contains } from './measure';
export type { StageProps, Play, LookTokens } from './stage';
export type { Act, Script } from './act';
export type { Point, Rect, Target } from './measure';
export type { CursorKind, CursorStyle } from './cursor';
export type { Theme, Palette, Fidelity, Layout } from './looks';
export type { KeysAt } from './keys';
export { clock, installVirtualClock } from './clock';
export type { ClockControl } from './clock';

export { Window, Bar, Text, Prompt, Caret } from './window';
export type { WindowProps, BarProps, TextProps, PromptProps } from './window';
export { EASE, bezier, css as easeCss } from './ease';
export type { EaseName, Bezier } from './ease';
