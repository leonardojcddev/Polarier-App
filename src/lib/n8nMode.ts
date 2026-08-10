// URL activa del webhook n8n, decidida por variable de entorno en BUILD time.
//
// VITE_N8N_MODE=prod|test  -> elige cuál de las dos URLs usar (por defecto 'prod').
// Se controla desde Easypanel (Environment) + Rebuild. Ningún usuario puede
// cambiarlo desde la app.

const PROD_URL = import.meta.env.VITE_N8N_WEBHOOK_URL as string;
const TEST_URL = (import.meta.env.VITE_N8N_WEBHOOK_URL_TEST as string) || PROD_URL;

const MODE = (import.meta.env.VITE_N8N_MODE as string) === 'test' ? 'test' : 'prod';

export const getN8nWebhookUrl = (): string => {
  return MODE === 'test' ? TEST_URL : PROD_URL;
};

// Webhook dedicado para el envío de informes por correo (flujo n8n aparte).
const EMAIL_PROD_URL = (import.meta.env.VITE_N8N_EMAIL_WEBHOOK_URL as string) || '';
const EMAIL_TEST_URL = (import.meta.env.VITE_N8N_EMAIL_WEBHOOK_URL_TEST as string) || EMAIL_PROD_URL;

export const getN8nEmailWebhookUrl = (): string => {
  return MODE === 'test' ? EMAIL_TEST_URL : EMAIL_PROD_URL;
};
