import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage }                                from '../hooks/useStorage';
import { DARK_COLORS, LIGHT_COLORS, ThemeColors } from '../theme';

export type ThemeMode   = 'dark' | 'light';
export type HapticLevel = 'off' | 'light' | 'medium' | 'heavy';
export type SoundTheme  = 'default' | 'military' | 'minimal';

interface AppContextValue {
  C:              ThemeColors;
  themeMode:      ThemeMode;
  setThemeMode:   (m: ThemeMode)   => void;
  hapticLevel:    HapticLevel;
  setHapticLevel: (l: HapticLevel) => void;
  soundTheme:     SoundTheme;
  setSoundTheme:  (t: SoundTheme)  => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [themeMode,   setThemeModeState]   = useState<ThemeMode>('dark');
  const [hapticLevel, setHapticLevelState] = useState<HapticLevel>('medium');
  const [soundTheme,  setSoundThemeState]  = useState<SoundTheme>('default');

  useEffect(() => {
    storage.load().then(s => {
      if (s.theme)       setThemeModeState(s.theme);
      if (s.hapticLevel) setHapticLevelState(s.hapticLevel as HapticLevel);
      if (s.soundTheme)  setSoundThemeState(s.soundTheme  as SoundTheme);
    });
  }, []);

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m);
    storage.save({ theme: m });
  };

  const setHapticLevel = (l: HapticLevel) => {
    setHapticLevelState(l);
    storage.save({ hapticLevel: l });
  };

  const setSoundTheme = (t: SoundTheme) => {
    setSoundThemeState(t);
    storage.save({ soundTheme: t });
  };

  const C = themeMode === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  return (
    <AppContext.Provider value={{ C, themeMode, setThemeMode, hapticLevel, setHapticLevel, soundTheme, setSoundTheme }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
