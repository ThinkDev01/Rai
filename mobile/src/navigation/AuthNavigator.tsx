import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { RegisterScreen } from '@/screens/auth/RegisterScreen';
import { VerifyScreen } from '@/screens/auth/VerifyScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';
import { InviteAcceptScreen } from '@/screens/auth/InviteAcceptScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Verify" component={VerifyScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="InviteAccept" component={InviteAcceptScreen} />
    </Stack.Navigator>
  );
}
