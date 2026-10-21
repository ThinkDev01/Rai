import React, { useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, Avatar } from '@/components/ui/primitives';
import type { Member } from '@/types/api.types';

/** Walk backward from cursor to find an active @mention query. */
function findMention(text: string, cursor: number): { query: string; start: number } | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') return { query: text.slice(i + 1, cursor), start: i };
    if (ch === ' ' || ch === '\n') break;
    i--;
  }
  return null;
}

/**
 * Textarea with @mention autocomplete — RN port of web components/ui/MentionTextarea.
 * Tracks the caret via onSelectionChange, shows a member dropdown above the field.
 */
export function MentionTextarea({
  value,
  onChange,
  onMentionSelect,
  placeholder,
  members,
  autoFocus,
  minHeight = 60,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Called with the member id each time a member is picked from the dropdown. */
  onMentionSelect?: (memberId: string) => void;
  placeholder?: string;
  members: Member[];
  autoFocus?: boolean;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [cursor, setCursor] = useState(0);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);

  const filtered = useMemo(
    () => (mention ? members.filter(m => m.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6) : []),
    [mention, members],
  );

  function handleChange(next: string) {
    onChange(next);
    setMention(findMention(next, cursor));
  }

  function insertMention(member: Member) {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.query.length);
    onChange(`${before}@${member.name} ${after}`);
    onMentionSelect?.(member.id);
    setMention(null);
    inputRef.current?.focus();
  }

  return (
    <View style={{ position: 'relative' }}>
      {mention && filtered.length > 0 ? (
        <View
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 6,
            zIndex: 50,
            borderRadius: t.radius.lg,
            borderWidth: 1,
            borderColor: t.colors.border,
            backgroundColor: t.colors.surfaceRaised,
            overflow: 'hidden',
            ...t.elevation.md,
          }}
        >
          <Txt variant="placeholder" size={t.fontSize.xxs} weight="semibold" style={{ paddingHorizontal: t.spacing[3], paddingVertical: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Mention
          </Txt>
          {filtered.map(m => (
            <Pressable key={m.id} onPress={() => insertMention(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[2] }}>
              <Avatar name={m.name} id={m.id} size={24} />
              <View style={{ flex: 1 }}>
                <Txt size={t.fontSize.sm} weight="medium" numberOfLines={1}>
                  {m.name}
                </Txt>
                {m.role_name ? <Txt variant="placeholder" size={t.fontSize.xxs} numberOfLines={1}>{m.role_name}</Txt> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onSelectionChange={e => {
          const pos = e.nativeEvent.selection.start;
          setCursor(pos);
          setMention(findMention(value, pos));
        }}
        autoFocus={autoFocus}
        multiline
        placeholder={placeholder}
        placeholderTextColor={t.colors.textPlaceholder}
        style={[{ minHeight, fontSize: t.fontSize.sm, color: t.colors.text, textAlignVertical: 'top' }, style]}
      />
    </View>
  );
}

/** Render comment text with @mentions highlighted (web renderWithMentions). */
export function MentionText({ text, memberNames }: { text: string; memberNames: string[] }) {
  const t = useTheme();
  const parts = useMemo(() => splitMentions(text, memberNames), [text, memberNames]);
  return (
    <Txt size={t.fontSize.sm}>
      {parts.map((p, i) =>
        p.mention ? (
          <Txt key={i} color={t.colors.primary} weight="semibold">
            {p.text}
          </Txt>
        ) : (
          <Txt key={i}>{p.text}</Txt>
        ),
      )}
    </Txt>
  );
}

function splitMentions(text: string, names: string[]): { text: string; mention: boolean }[] {
  if (names.length === 0) return [{ text, mention: false }];
  // Longest names first so "@Ann Lee" wins over "@Ann".
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${escaped.join('|')})`, 'g');
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false });
  return out.length ? out : [{ text, mention: false }];
}
