import React, { useState, useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { storage }           from './src/hooks/useStorage';
import OnboardingScreen      from './src/screens/OnboardingScreen';
import LoginScreen           from './src/screens/LoginScreen';
import ChannelPickerScreen   from './src/screens/ChannelPickerScreen';
import MainScreen            from './src/screens/MainScreen';

type Screen = 'loading' | 'onboarding' | 'login' | 'channels' | 'main';

export default function App() {
  const [screen,     setScreen]     = useState<Screen>('loading');
  const [myName,     setMyName]     = useState('');
  const [myCh,       setMyCh]       = useState('geral-1');
  const [myPin,      setMyPin]      = useState<string | undefined>(undefined);
  const [myChPin,    setMyChPin]    = useState<string | undefined>(undefined);
  const [loading,    setLoading]    = useState(false);

  // Load saved name on startup
  useEffect(() => {
    storage.load().then(s => {
      if (!s.hasOnboarded) {
        setScreen('onboarding');
      } else if (s.userName) {
        setMyName(s.userName);
        setScreen('channels');
      } else {
        setScreen('login');
      }
    });
  }, []);

  const handleOnboardingDone = () => {
    storage.save({ hasOnboarded: true });
    setScreen('login');
  };

  const handleEnter = (name: string) => {
    setLoading(true);
    setMyName(name);
    storage.save({ userName: name, hasOnboarded: true });
    setTimeout(() => { setScreen('channels'); setLoading(false); }, 400);
  };

  const handleJoinChannel = (channel: string, pin?: string, channelPin?: string) => {
    setMyCh(channel);
    setMyPin(pin);
    setMyChPin(channelPin);
    setScreen('main');
  };

  const handleSwitchChannel = () => setScreen('channels');

  const handleLogout = () => setScreen('channels');

  if (screen === 'loading') return null;

  return (
    <SafeAreaProvider>
      {screen === 'onboarding' && (
        <OnboardingScreen onDone={handleOnboardingDone} />
      )}
      {screen === 'login' && (
        <LoginScreen onEnter={handleEnter} loading={loading} savedName={myName} />
      )}
      {screen === 'channels' && (
        <ChannelPickerScreen
          myName={myName}
          onJoin={handleJoinChannel}
          onBack={myName ? () => setScreen('login') : undefined}
        />
      )}
      {screen === 'main' && (
        <MainScreen
          myName={myName}
          myChannel={myCh}
          myPin={myPin}
          myChannelPin={myChPin}
          onLogout={handleLogout}
          onSwitchChannel={handleSwitchChannel}
        />
      )}
    </SafeAreaProvider>
  );
}
