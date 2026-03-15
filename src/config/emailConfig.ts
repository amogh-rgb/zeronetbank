export const emailConfig = {
  user: process.env.EMAIL_USER || '',
  pass: process.env.EMAIL_PASS || '',
  service: 'gmail' as const,
};

export default emailConfig;
