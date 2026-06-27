import * as FileSystem from 'expo-file-system/legacy';

const FILE = (FileSystem.documentDirectory ?? '') + 'wavetalk_storage.json';

export interface Store {
  userName?:        string;
  hasOnboarded?:    boolean;
  recentChannels?:  string[];
  favoriteChannels?: string[];
  theme?:           'dark' | 'light';
  hapticLevel?:     'off' | 'light' | 'medium' | 'heavy';
  soundTheme?:      'default' | 'military' | 'minimal';
}

let cache: Store | null = null;

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const info = await FileSystem.getInfoAsync(FILE);
    if (info.exists) {
      cache = JSON.parse(await FileSystem.readAsStringAsync(FILE));
      return cache!;
    }
  } catch {}
  cache = {};
  return cache;
}

async function save(data: Partial<Store>): Promise<void> {
  const current = await load();
  cache = { ...current, ...data };
  try {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(cache));
  } catch {}
}

export const storage = { load, save };
