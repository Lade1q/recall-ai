import { registerSchema, loginSchema } from '../schemas/auth.schema';

/**
 * Regression tests for #101 — register/login must reject whitespace-only
 * and overlong passwords, and must trim email/name before validating.
 */
describe('registerSchema', () => {
  const validInput = {
    email: 'user@example.com',
    password: 'Password123!',
    name: 'Test User',
  };

  it('accepts a valid payload', () => {
    expect(() => registerSchema.parse(validInput)).not.toThrow();
  });

  it('rejects a whitespace-only password', () => {
    expect(() => registerSchema.parse({ ...validInput, password: '        ' })).toThrow(
      /whitespace/
    );
  });

  it('rejects a password longer than 128 characters', () => {
    expect(() => registerSchema.parse({ ...validInput, password: 'a'.repeat(129) })).toThrow(
      /128 characters/
    );
  });

  it('accepts a password exactly 128 characters long', () => {
    expect(() => registerSchema.parse({ ...validInput, password: 'a'.repeat(128) })).not.toThrow();
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(() => registerSchema.parse({ ...validInput, password: 'a1!' })).toThrow(
      /at least 8 characters/
    );
  });

  it('trims surrounding whitespace from email and name', () => {
    const result = registerSchema.parse({
      ...validInput,
      email: '  user@example.com  ',
      name: '  Test User  ',
    });

    expect(result.email).toBe('user@example.com');
    expect(result.name).toBe('Test User');
  });

  it('does not trim the password', () => {
    const result = registerSchema.parse({ ...validInput, password: ' Password123! ' });

    expect(result.password).toBe(' Password123! ');
  });
});

describe('loginSchema', () => {
  const validInput = { email: 'user@example.com', password: 'Password123!' };

  it('accepts a valid payload', () => {
    expect(() => loginSchema.parse(validInput)).not.toThrow();
  });

  it('rejects a whitespace-only password', () => {
    expect(() => loginSchema.parse({ ...validInput, password: '   ' })).toThrow(/whitespace/);
  });

  it('rejects a password longer than 128 characters', () => {
    expect(() => loginSchema.parse({ ...validInput, password: 'a'.repeat(129) })).toThrow(
      /128 characters/
    );
  });

  it('trims surrounding whitespace from email', () => {
    const result = loginSchema.parse({ ...validInput, email: '  user@example.com  ' });

    expect(result.email).toBe('user@example.com');
  });
});
