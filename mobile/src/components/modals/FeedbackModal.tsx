import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, Button } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/Input';
import { ModalSheet } from './ModalSheet';
import { useSubmitFeedback } from '@/api/misc';

const TITLE_MAX = 150;
const BODY_MIN = 5;
const BODY_MAX = 5000;

interface Props {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: Props) {
  const t = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const { mutate, isPending } = useSubmitFeedback();

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length >= BODY_MIN &&
    body.length <= BODY_MAX &&
    title.length <= TITLE_MAX;

  function handleSubmit() {
    if (!canSubmit) return;
    mutate({ title: title.trim(), body: body.trim() }, { onSuccess: onClose });
  }

  return (
    <ModalSheet
      title="Send Feedback"
      onClose={onClose}
      footer={
        <Button
          title="Send"
          onPress={handleSubmit}
          loading={isPending}
          disabled={!canSubmit}
        />
      }
    >
      <View style={{ gap: t.spacing[4] }}>
        <View style={{ gap: t.spacing[1.5] }}>
          <Txt size={t.fontSize.sm} weight="medium">Title</Txt>
          <TextField
            placeholder="Brief summary of your feedback"
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
          />
          <Txt
            size={t.fontSize.xxs}
            color={title.length > TITLE_MAX * 0.85 ? t.colors.warning : t.colors.textPlaceholder}
            style={{ textAlign: 'right' }}
          >
            {title.length}/{TITLE_MAX}
          </Txt>
        </View>

        <View style={{ gap: t.spacing[1.5] }}>
          <Txt size={t.fontSize.sm} weight="medium">Details</Txt>
          <TextField
            placeholder="Describe your feedback, bug, or feature request…"
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={6}
            maxLength={BODY_MAX}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />
          <Txt
            size={t.fontSize.xxs}
            color={body.length > BODY_MAX * 0.9 ? t.colors.warning : t.colors.textPlaceholder}
            style={{ textAlign: 'right' }}
          >
            {body.length}/{BODY_MAX}
          </Txt>
        </View>
      </View>
    </ModalSheet>
  );
}
