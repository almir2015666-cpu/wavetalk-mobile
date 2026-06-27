import * as Haptics from 'expo-haptics';
import { useApp }   from '../contexts/AppContext';

export function useHaptics() {
  const { hapticLevel } = useApp();

  const impact = (preferred: 'Light' | 'Medium' | 'Heavy' = 'Medium') => {
    if (hapticLevel === 'off') return;
    const styleMap = {
      light:  Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy:  Haptics.ImpactFeedbackStyle.Heavy,
    } as const;
    const style = hapticLevel === 'medium'
      ? Haptics.ImpactFeedbackStyle[preferred]
      : styleMap[hapticLevel as 'light' | 'medium' | 'heavy'];
    Haptics.impactAsync(style).catch(() => {});
  };

  const notification = (type: 'Success' | 'Warning' | 'Error' = 'Success') => {
    if (hapticLevel === 'off') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType[type]).catch(() => {});
  };

  return { impact, notification };
}
