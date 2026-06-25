import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen        from './src/screens/LoginScreen';
import ChannelPickerScreen from './src/screens/ChannelPickerScreen';
import MainScreen         from './src/screens/MainScreen';

type Screen = 'login' | 'channels' | 'main';

export default function App() {
  const [screen,  setScreen]  = useState<Screen>('login');
  const [loading, setLoading] = useState(false);
  const [myName,  setMyName]  = useState('');
  const [myCh,    setMyCh]    = useState('geral');

  const handleEnter = (name: string) => {
    setLoading(true);
    setMyName(name);
    setTimeout(() => { setScreen('channels'); setLoading(false); }, 400);
  };

  const handleJoinChannel = (channel: string) => {
    setMyCh(channel);
    setScreen('main');
  };

  const handleLogout = () => {
    setScreen('channels');
  };

  const handleSwitchChannel = () => {
    setScreen('channels');
  };

  return (
    <SafeAreaProvider>
      {screen === 'login' && (
        <LoginScreen onEnter={handleEnter} loading={loading} />
      )}
      {screen === 'channels' && (
        <ChannelPickerScreen
          myName={myName}
          onJoin={handleJoinChannel}
          onBack={myName ? handleLogout : undefined}
        />
      )}
      {screen === 'main' && (
        <MainScreen
          myName={myName}
          myChannel={myCh}
          onLogout={handleLogout}
          onSwitchChannel={handleSwitchChannel}
        />
      )}
    </SafeAreaProvider>
  );
}
