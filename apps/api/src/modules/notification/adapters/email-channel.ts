import type { NotificationChannel, RecipientResolver } from '../ports';

/**
 * Email-канал (заглушка для дева): резолвит адрес и логирует. Реальная отправка (SMTP/провайдер) —
 * замена этого адаптера за тем же портом, без правок политики/диспетчера.
 */
export const createEmailChannel = (deps: { recipients: RecipientResolver }): NotificationChannel => ({
  id: 'email',
  deliver: async (n) => {
    const email = await deps.recipients.emailOf(n.userId);
    if (email) {
      // eslint-disable-next-line no-console
      console.log(`[email→${email}] ${n.title}: ${n.body}`);
    }
  },
});
