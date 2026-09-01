import { useState, useCallback, useMemo } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { getChangePasswordErrorMessage, profileApi } from '../api/profile.api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

const MIN_PASSWORD_LENGTH = 8;

export function PasswordTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const newPasswordTouched = newPassword.length > 0;
  const confirmTouched = confirmPassword.length > 0;

  const passwordValidation = useMemo(() => {
    if (!newPasswordTouched) return { status: 'hint' as const, message: 'Ít nhất 8 ký tự.' };
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      const missing = MIN_PASSWORD_LENGTH - newPassword.length;
      return { status: 'error' as const, message: `Còn thiếu ${missing} ký tự.` };
    }
    return { status: 'ok' as const, message: 'Đủ dài.' };
  }, [newPassword, newPasswordTouched]);

  const confirmMismatch = confirmTouched && newPassword !== confirmPassword;

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword &&
    !saving;

  const handleChangePassword = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    setServerError(null);
    setSuccess(false);
    try {
      await profileApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (error) {
      setServerError(getChangePasswordErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [canSubmit, currentPassword, newPassword]);

  return (
    <Card>
      <CardContent className="space-y-5 pt-2">
        <div className="max-w-[440px]">
          <Label htmlFor="pw-old" className="mb-2 text-[13px] font-semibold">
            Mật khẩu hiện tại <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="pw-old"
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setServerError(null);
            }}
            aria-invalid={!!serverError || undefined}
            aria-describedby={serverError ? 'pw-old-error' : undefined}
          />
          {serverError && (
            <p
              id="pw-old-error"
              className="text-destructive mt-1.5 flex items-start gap-1.5 text-[12px] leading-[1.6]"
            >
              <AlertCircle size={13} className="mt-0.5 flex-none" aria-hidden="true" />
              {serverError}
            </p>
          )}
        </div>

        <div className="max-w-[440px]">
          <Label htmlFor="pw-new" className="mb-2 text-[13px] font-semibold">
            Mật khẩu mới <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="pw-new"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={passwordValidation.status === 'error' || undefined}
            aria-describedby="pw-new-hint"
          />
          {passwordValidation.status === 'hint' && (
            <p id="pw-new-hint" className="text-muted-foreground mt-1.5 text-[12px] leading-[1.65]">
              {passwordValidation.message}
            </p>
          )}
          {passwordValidation.status === 'error' && (
            <p
              id="pw-new-hint"
              className="text-destructive mt-1.5 flex items-start gap-1.5 text-[12px] leading-[1.6]"
            >
              <AlertCircle size={13} className="mt-0.5 flex-none" aria-hidden="true" />
              {passwordValidation.message}
            </p>
          )}
          {passwordValidation.status === 'ok' && (
            <p
              id="pw-new-hint"
              className="text-mastery-strong mt-1.5 flex items-center gap-1.5 text-[12px]"
            >
              <Check size={13} className="flex-none" aria-hidden="true" />
              {passwordValidation.message}
            </p>
          )}
        </div>

        <div className="max-w-[440px]">
          <Label htmlFor="pw-confirm" className="mb-2 text-[13px] font-semibold">
            Nhập lại mật khẩu mới <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="pw-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={confirmMismatch || undefined}
            aria-describedby={confirmMismatch ? 'pw-confirm-error' : undefined}
          />
          {confirmMismatch && (
            <p
              id="pw-confirm-error"
              className="text-destructive mt-1.5 flex items-start gap-1.5 text-[12px] leading-[1.6]"
            >
              <AlertCircle size={13} className="mt-0.5 flex-none" aria-hidden="true" />
              Mật khẩu không khớp.
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="justify-end gap-3.5">
        {success && <p className="text-mastery-strong text-[12px]">Đổi mật khẩu thành công.</p>}
        <Button onClick={handleChangePassword} loading={saving} disabled={!canSubmit}>
          Đổi mật khẩu
        </Button>
      </CardFooter>
    </Card>
  );
}
