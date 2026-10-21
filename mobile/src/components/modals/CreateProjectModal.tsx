import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Check } from 'lucide-react-native';
import { ModalSheet } from './ModalSheet';
import { TextField } from '@/components/ui/Input';
import { Button, Txt, withAlpha } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { useCreateProject } from '@/api/projects';
import { generateProjectKey, capitalizeFirst } from '@/lib/text';
import { PROJECT_ICONS } from '@/lib/projectIcons';

// ── Icon picker ───────────────────────────────────────────────────────────────

function IconPicker({
  selected,
  projectKey,
  onChange,
}: {
  selected: string | null;
  projectKey: string;
  onChange: (id: string | null) => void;
}) {
  const t = useTheme();
  const initials = (projectKey || '?').slice(0, 2).toUpperCase();

  return (
    <View style={{ gap: t.spacing[2] }}>
      <Txt variant="subtle" weight="medium" size={t.fontSize.xs}>
        Icon <Txt variant="placeholder" size={t.fontSize.xs}>(optional)</Txt>
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: t.spacing[2], paddingVertical: 2 }}
      >
        {/* None — initials */}
        <Pressable onPress={() => onChange(null)}>
          <View
            style={{
              width: 48, height: 48, borderRadius: 12,
              backgroundColor: t.colors.surfaceSunken,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2,
              borderColor: selected === null ? t.colors.primary : t.colors.border,
            }}
          >
            <Txt weight="bold" size={t.fontSize.sm} color={t.colors.textSubtle}>
              {initials}
            </Txt>
            {selected === null ? (
              <View style={{
                position: 'absolute', top: -4, right: -4,
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: t.colors.primary,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={10} color="#fff" strokeWidth={3} />
              </View>
            ) : null}
          </View>
        </Pressable>

        {/* Icon options */}
        {PROJECT_ICONS.map(({ id, Icon, gradient }) => {
          const isSelected = selected === id;
          return (
            <Pressable key={id} onPress={() => onChange(id)}>
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 48, height: 48, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: isSelected ? '#fff' : 'transparent',
                  opacity: isSelected ? 1 : 0.85,
                }}
              >
                <Icon size={22} color="#fff" strokeWidth={2} />
                {isSelected ? (
                  <View style={{
                    position: 'absolute', top: -4, right: -4,
                    width: 16, height: 16, borderRadius: 8,
                    backgroundColor: t.colors.primary,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={10} color="#fff" strokeWidth={3} />
                  </View>
                ) : null}
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const createProject = useCreateProject();

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onName(v: string) {
    const val = capitalizeFirst(v);
    setName(val);
    if (!keyTouched) setKey(generateProjectKey(val));
  }

  function onSubmit() {
    setError(null);
    if (!name.trim()) return setError('Project name is required');
    createProject.mutate(
      {
        name: name.trim(),
        key: key || generateProjectKey(name),
        description: description.trim() || undefined,
        visibility,
        avatarType: selectedIcon ? 'icon' : 'initials',
        avatarValue: selectedIcon ?? null,
      },
      {
        onSuccess: p => {
          onClose();
          nav.navigate('Project', { projectId: p.id, screen: 'Overview' });
        },
      },
    );
  }

  const VisBtn = ({ v, label, hint }: { v: 'public' | 'private'; label: string; hint: string }) => (
    <Pressable
      onPress={() => setVisibility(v)}
      style={{
        flex: 1,
        padding: t.spacing[3],
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: visibility === v ? t.colors.primary : t.colors.border,
        backgroundColor: visibility === v ? withAlpha(t.colors.primary, 0.06) : t.colors.surfaceRaised,
        gap: 2,
      }}
    >
      <Txt weight="semibold" color={visibility === v ? t.colors.primary : t.colors.text}>
        {label}
      </Txt>
      <Txt variant="subtle" size={t.fontSize.xxs}>
        {hint}
      </Txt>
    </Pressable>
  );

  return (
    <ModalSheet
      title="Create project"
      onClose={onClose}
      footer={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button title="Create project" loading={createProject.isPending} onPress={onSubmit} />
        </>
      }
    >
      <TextField
        label="Project name"
        required
        value={name}
        onChangeText={onName}
        placeholder="Mobile App"
      />
      <TextField
        label="Key"
        required
        autoCapitalize="characters"
        value={key}
        onChangeText={v => {
          setKeyTouched(true);
          setKey(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
        }}
        hint="Used as ticket prefix — MOB-1, MOB-2…"
      />
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Optional"
        multiline
      />

      <IconPicker
        selected={selectedIcon}
        projectKey={key}
        onChange={setSelectedIcon}
      />

      <View style={{ gap: t.spacing[1.5] }}>
        <Txt variant="subtle" weight="medium" size={t.fontSize.xs}>
          Visibility
        </Txt>
        <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
          <VisBtn v="private" label="Private" hint="Assigned members only" />
          <VisBtn v="public" label="Public" hint="Visible to whole team" />
        </View>
      </View>

      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
    </ModalSheet>
  );
}
