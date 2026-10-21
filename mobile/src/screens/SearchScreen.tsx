import React, { useState } from 'react';
import { View, TextInput, Pressable, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Txt } from '@/components/ui/primitives';
import { TypeIcon, StatusChip } from '@/components/ui/chips';
import { EmptyState, Loading } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useSearch } from '@/api/misc';
import { useDebounce } from '@/hooks/useDebounce';
import { MESSAGES } from '@/lib/messages';

export function SearchScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const { data, isFetching } = useSearch(debounced);
  const showResults = debounced.trim().length >= 2;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Search" onBack={() => nav.goBack()} showThemeToggle={false} />
      <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
        <View style={{ padding: t.spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingHorizontal: t.spacing[3], height: 44, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surfaceRaised }}>
            <SearchIcon size={18} color={t.colors.textSubtle} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search tickets…"
              placeholderTextColor={t.colors.textPlaceholder}
              style={{ flex: 1, color: t.colors.text, fontSize: t.fontSize.sm }}
            />
            {q ? (
              <Pressable onPress={() => setQ('')} hitSlop={8}>
                <X size={16} color={t.colors.textSubtle} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {!showResults ? (
          <EmptyState
            title={MESSAGES.search.hint.title}
            description={MESSAGES.search.hint.description}
            icon={<SearchIcon size={24} color={t.colors.textPlaceholder} />}
          />
        ) : isFetching && !data?.length ? (
          <Loading />
        ) : !data || data.length === 0 ? (
          <EmptyState title={MESSAGES.search.empty.title} description={`No tickets found for “${debounced}”`} />
        ) : (
          <FlatList
            data={data}
            keyExtractor={r => r.id}
            contentContainerStyle={{ paddingHorizontal: t.spacing[4] }}
            renderItem={({ item: r }) => (
              <Pressable
                onPress={() => nav.navigate('TicketDetail', { projectId: r.projectId, ticketKey: r.key })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingVertical: t.spacing[3], borderBottomWidth: 1, borderBottomColor: t.colors.borderSubtle }}
              >
                <TypeIcon type={r.type} />
                <Txt size={t.fontSize.xs} weight="semibold" color={t.colors.textSubtle} style={{ width: 60 }} numberOfLines={1}>
                  {r.key}
                </Txt>
                <Txt style={{ flex: 1 }} numberOfLines={1}>
                  {r.title}
                </Txt>
                <StatusChip status={r.status} size="sm" />
              </Pressable>
            )}
          />
        )}
      </View>
    </View>
  );
}
