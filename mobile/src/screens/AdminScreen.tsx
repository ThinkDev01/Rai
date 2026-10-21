import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Loading } from '@/components/ui/states';

/**
 * /admin was merged into /team on the web (admin actions render inline on the
 * Team page when the caller has the role). Route kept only as a redirect so
 * old deep links don't dead-end — mirrors web app/orgs/[slug]/admin/page.tsx.
 */
export function AdminScreen() {
  const nav = useNavigation<any>();
  useEffect(() => {
    nav.replace('Team');
  }, [nav]);
  return (
    <View style={{ flex: 1 }}>
      <Loading />
    </View>
  );
}
