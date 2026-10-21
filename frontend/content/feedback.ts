/**
 * Feedback — copy for the in-app feedback prompt + modal. Submissions store in
 * the DB and email support (backend feedback module).
 */

export const FEEDBACK = {
  // Caps mirror backend/modules/feedback/feedback.types.ts.
  titleMax: 150,
  bodyMin:  5,
  bodyMax:  5000,

  prompt: {
    text:    'Enjoying Rai? We\'d love your feedback.',
    action:  'Give feedback',
    dismiss: 'Maybe later',
  },

  modal: {
    title:           'Send us feedback',
    subtitle:        'Tell us what\'s working, what\'s not, or what you\'d like to see.',
    titleLabel:      'Title',
    titlePlaceholder:'A short summary',
    bodyLabel:       'Your feedback',
    bodyPlaceholder: 'Tell us more…',
    submit:          'Send feedback',
    sending:         'Sending…',
    cancel:          'Cancel',
    success:         'Thanks — your feedback has been sent!',
    error:           'Could not send feedback. Please try again.',
  },

  settings: {
    attachmentNote: 'Have an attachment? Email us directly.',
  },
} as const;
