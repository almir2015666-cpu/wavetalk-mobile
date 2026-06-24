import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from './src/screens/LoginScreen';
import MainScreen  from './src/screens/MainScreen';

type Screen = 'login' | 'main';

export default function App() {
  const [screen,  setScreen]  = useState<Screen>('login');
  const [loading, setLoading] = useState(false);
  const [myName,  setMyName]  = useState('');
  const [myCh,    setMyCh]    = useState('geral');

  const handleEnter = (name: string) => {
    setLoading(true);
    setMyName(name);
    setTimeout(() => { setScreen('main'); setLoading(false); }, 600);
  };

  return (
    <SafeAreaProvider>
      {screen === 'login'
        ? <LoginScreen onEnter={handleEnter} loading={loading}/>
        : <MainScreen  myName={myName} myChannel="geral"/>
      }
    </SafeAreaProvider>
  );
}
