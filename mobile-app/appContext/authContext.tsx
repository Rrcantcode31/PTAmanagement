import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Bump this whenever the shape of `User` changes.
// Old cached users with a different version get cleared on next app open.
const AUTH_VERSION = '3';



type User = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  type: 'user' | 'driver';

  terminal_id:   number | null;
  terminal_name: string | null;
  terminal_lat:  number | null;   // ← new
  terminal_lng:  number | null;   // ← new
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (userData: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
      const storedVersion = await AsyncStorage.getItem('auth_version');

      // If the stored user shape is from an older build, wipe it.
      if (storedVersion !== AUTH_VERSION) {
        await AsyncStorage.multiRemove(['user', 'token', 'auth_version']);
        return;
      }

      const storedUser  = await AsyncStorage.getItem('user');
      const storedToken = await AsyncStorage.getItem('token');

      if (storedUser)  setUser(JSON.parse(storedUser));
      if (storedToken) setToken(storedToken);
    } catch (error) {
      console.error('Failed to load user', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userData: User, userToken: string) => {
    setUser(userData);
    setToken(userToken);

    await AsyncStorage.setItem('user', JSON.stringify(userData));
    await AsyncStorage.setItem('token', userToken);
    await AsyncStorage.setItem('auth_version', AUTH_VERSION);
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove(['user', 'token']);
    // Note: we keep auth_version so a fresh login just re-writes it
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};