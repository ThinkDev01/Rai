import React, { useState } from 'react';
import { View, Modal, Pressable } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './primitives';
import { toIsoDate, parseIsoDate, formatDate } from '@/lib/dates';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Calendar date picker — mobile equivalent of web components/ui/DatePicker. */
export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = 'Pick a date',
  required,
}: {
  label?: string;
  value: string; // ISO YYYY-MM-DD or ''
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const selected = value ? parseIsoDate(value) : null;
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const minDate = min ? parseIsoDate(min) : null;
  const maxDate = max ? parseIsoDate(max) : null;

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const isDisabled = (d: Date) => {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };
  const isSelected = (d: Date) => selected != null && toIsoDate(d) === toIsoDate(selected);

  return (
    <View style={{ gap: t.spacing[1.5] }}>
      {label ? (
        <Txt variant="subtle" weight="medium" size={t.fontSize.xs}>
          {label}
          {required ? <Txt color={t.colors.danger}> *</Txt> : null}
        </Txt>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], minHeight: 44, paddingHorizontal: t.spacing[3], borderRadius: t.radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surfaceRaised }}
      >
        <Txt style={{ flex: 1 }} color={value ? t.colors.text : t.colors.textPlaceholder}>
          {value ? formatDate(value) : placeholder}
        </Txt>
        <Calendar size={16} color={t.colors.textSubtle} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: t.colors.backdrop, alignItems: 'center', justifyContent: 'center', padding: t.spacing[4] }} onPress={() => setOpen(false)}>
          <Pressable style={{ width: '100%', maxWidth: 340, backgroundColor: t.colors.surfaceOverlay, borderRadius: t.radius.lg, padding: t.spacing[4], gap: t.spacing[3] }} onPress={e => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable onPress={() => setView(new Date(year, month - 1, 1))} hitSlop={8} style={{ padding: 4 }}>
                <ChevronLeft size={20} color={t.colors.text} />
              </Pressable>
              <Txt weight="semibold">
                {MONTHS[month]} {year}
              </Txt>
              <Pressable onPress={() => setView(new Date(year, month + 1, 1))} hitSlop={8} style={{ padding: 4 }}>
                <ChevronRight size={20} color={t.colors.text} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {WEEKDAYS.map((w, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <Txt variant="placeholder" size={t.fontSize.xxs} weight="semibold">
                    {w}
                  </Txt>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((d, i) => (
                <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                  {d ? (
                    <Pressable
                      disabled={isDisabled(d)}
                      onPress={() => {
                        onChange(toIsoDate(d));
                        setOpen(false);
                      }}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md, backgroundColor: isSelected(d) ? t.colors.primary : 'transparent', opacity: isDisabled(d) ? 0.3 : 1 }}
                    >
                      <Txt size={t.fontSize.sm} color={isSelected(d) ? t.colors.primaryText : t.colors.text}>
                        {d.getDate()}
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
            {value ? (
              <Pressable onPress={() => { onChange(''); setOpen(false); }} style={{ alignSelf: 'center' }}>
                <Txt variant="link" size={t.fontSize.xs}>
                  Clear
                </Txt>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
