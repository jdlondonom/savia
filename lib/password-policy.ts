export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordPolicyMessage(value: unknown): string | null {
  const password = String(value ?? '');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  if (!/[a-záéíóúñ]/i.test(password) || !/\d/.test(password) || !/[^\p{L}\p{N}]/u.test(password)) {
    return 'Incluye letras, al menos un número y un símbolo.';
  }
  return null;
}

export function isStrongPassword(value: unknown): boolean {
  return passwordPolicyMessage(value) === null;
}
