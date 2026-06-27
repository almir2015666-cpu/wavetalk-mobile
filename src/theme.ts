export type ThemeColors = {
  bg:        string;
  surface:   string;
  card:      string;
  border:    string;
  border2:   string;
  cyan:      string;
  cyanDim:   string;
  purple:    string;
  purpleDim: string;
  green:     string;
  greenDim:  string;
  red:       string;
  orange:    string;
  text:      string;
  text2:     string;
  text3:     string;
};

export const DARK_COLORS: ThemeColors = {
  bg:         '#07090f',
  surface:    '#0d1320',
  card:       '#111927',
  border:     '#1c2b3d',
  border2:    '#243347',
  cyan:       '#00d4ff',
  cyanDim:    '#00d4ff33',
  purple:     '#7c3aff',
  purpleDim:  '#7c3aff33',
  green:      '#00ff88',
  greenDim:   '#00ff8833',
  red:        '#ff4455',
  orange:     '#ff8c00',
  text:       '#dde8f5',
  text2:      '#6b859e',
  text3:      '#3d566e',
};

export const LIGHT_COLORS: ThemeColors = {
  bg:         '#f0f4f8',
  surface:    '#ffffff',
  card:       '#e8edf5',
  border:     '#d0d9e6',
  border2:    '#c0ccd9',
  cyan:       '#007aaa',
  cyanDim:    '#007aaa22',
  purple:     '#6b21e8',
  purpleDim:  '#6b21e822',
  green:      '#007a44',
  greenDim:   '#007a4422',
  red:        '#cc2233',
  orange:     '#bb5500',
  text:       '#1a2535',
  text2:      '#4a6080',
  text3:      '#8899aa',
};

// Backward-compat default (dark) — used in non-themed components
export const C = DARK_COLORS;

export const AVATAR_COLORS: [string, string][] = [
  ['#00d4ff','#7c3aff'],
  ['#ff6b9d','#c44dff'],
  ['#ff8c00','#ff4455'],
  ['#00ff88','#00d4ff'],
  ['#7c3aff','#ff6b9d'],
];

export function avatarColor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export const CHANNELS = [
  { key: 'geral',      icon: '📻' },
  { key: 'operações',  icon: '⚙️' },
  { key: 'time-1',     icon: '🏃' },
  { key: 'suporte',    icon: '🛠️' },
];
