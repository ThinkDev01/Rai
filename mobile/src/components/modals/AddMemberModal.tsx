import React, { useMemo, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { UserPlus, Mail } from 'lucide-react-native';
import { ModalSheet } from './ModalSheet';
import { TextField } from '@/components/ui/Input';
import { Txt, Avatar, Button } from '@/components/ui/primitives';
import { Loading } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamMembers } from '@/api/misc';
import { useAddProjectMember } from '@/api/projects';
import type { Member } from '@/types/api.types';

export function AddMemberModal({
  projectId,
  existingMemberIds,
  onClose,
}: {
  projectId: string;
  existingMemberIds: string[];
  onClose: () => void;
}) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const [filter, setFilter] = useState('');
  // Track which user ids are mid-add so only the clicked button shows a loader
  // (the mutation's shared isPending would otherwise spin every Add button).
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const { data: allUsers = [], isLoading } = useTeamMembers();
  const { mutate: addMember } = useAddProjectMember(projectId);

  const eligible = useMemo(
    () =>
      allUsers.filter(
        u =>
          !existingMemberIds.includes(u.id) &&
          (filter === '' ||
            u.name.toLowerCase().includes(filter.toLowerCase()) ||
            u.email.toLowerCase().includes(filter.toLowerCase())),
      ),
    [allUsers, existingMemberIds, filter],
  );

  function handleAdd(user: Member) {
    setPendingIds(s => new Set(s).add(user.id));
    addMember(user.id, {
      // stays open so admin can add multiple
      onSettled: () =>
        setPendingIds(s => {
          const next = new Set(s);
          next.delete(user.id);
          return next;
        }),
    });
  }

  return (
    <ModalSheet
      title="Add member"
      onClose={onClose}
      footer={
        <>
          <Pressable
            onPress={() => {
              onClose();
              nav.navigate('Team');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 'auto' }}
          >
            <Mail size={13} color={t.colors.primary} />
            <Txt variant="link" size={t.fontSize.xs}>
              Don't see them? Invite by email →
            </Txt>
          </Pressable>
          <Button title="Done" variant="secondary" onPress={onClose} />
        </>
      }
    >
      <TextField
        placeholder="Search by name or email…"
        value={filter}
        onChangeText={setFilter}
        autoCapitalize="none"
      />

      {isLoading ? (
        <Loading />
      ) : eligible.length === 0 ? (
        <Txt variant="placeholder" style={{ textAlign: 'center', paddingVertical: t.spacing[6] }}>
          {filter ? 'No users match your search.' : 'All org members are already in this project.'}
        </Txt>
      ) : (
        <View>
          {eligible.map(user => (
            <View key={user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], paddingVertical: t.spacing[2.5] }}>
              <Avatar name={user.name} id={user.id} size={32} />
              <View style={{ flex: 1 }}>
                <Txt size={t.fontSize.sm} weight="medium" numberOfLines={1}>
                  {user.name}
                </Txt>
                <Txt variant="placeholder" size={t.fontSize.xs} numberOfLines={1}>
                  {user.email}
                </Txt>
              </View>
              <Button title="Add" size="sm" loading={pendingIds.has(user.id)} disabled={pendingIds.has(user.id)} onPress={() => handleAdd(user)} leftIcon={<UserPlus size={12} color="#fff" />} />
            </View>
          ))}
        </View>
      )}
    </ModalSheet>
  );
}
