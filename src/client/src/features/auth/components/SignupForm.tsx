import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/features/auth/context/AuthContext';
import { getAuthErrorMessage } from '@/features/auth/api/auth.api';
import { registerSchema, type RegisterFormData } from '@/features/auth/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
  const navigate = useNavigate();
  const { register: registerAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });

  const passwordValue = watch('password');
  const isPasswordValid = Boolean(passwordValue && passwordValue.length >= 8 && !errors.password);

  const onSubmit = async (data: RegisterFormData) => {
    try {
      await registerAuth(data.email, data.password, data.name);
      toast.success('Đăng ký tài khoản thành công! Vui lòng đăng nhập.');
      navigate('/login');
    } catch (error) {
      const { code, message } = getAuthErrorMessage(error);
      // AM-01 [E1]: email đã tồn tại là lỗi của một ô cụ thể — gắn vào ô email,
      // giữ nguyên ba ô còn lại. Các lỗi khác (mạng/validation) là cấp biểu mẫu.
      if (code === 'EMAIL_CONFLICT') {
        setError('email', { type: 'server', message });
        setFocus('email');
      } else {
        toast.error(message);
      }
    }
  };

  return (
    <Card {...props}>
      <CardHeader>
        <div className="font-heading mb-6 text-base tracking-tight">Recall AI</div>
        <CardTitle className="text-[23px]">Tạo tài khoản</CardTitle>
        <CardDescription className="text-[13px]">
          Tài khoản dùng được ngay sau khi tạo, không có bước xác minh email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Tên hiển thị</FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder="Ví dụ: Trần Minh Anh"
                autoComplete="name"
                autoFocus
                {...register('name')}
              />
              {errors.name?.message && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email?.message && <FieldError>{errors.email.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="hover:bg-accent hover:text-foreground focus-visible:ring-ring text-muted-foreground absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4.25 w-4.25" strokeWidth={1.8} />
                  ) : (
                    <Eye className="h-4.25 w-4.25" strokeWidth={1.8} />
                  )}
                </button>
              </div>
              {isPasswordValid ? (
                <FieldDescription className="mt-1">
                  <span className="inline-flex items-center text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                </FieldDescription>
              ) : errors.password?.message ? (
                <FieldError className="mt-1">{errors.password.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="confirm-password">Nhập lại mật khẩu</FieldLabel>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-10"
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  className="hover:bg-accent hover:text-foreground focus-visible:ring-ring text-muted-foreground absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4.25 w-4.25" strokeWidth={1.8} />
                  ) : (
                    <Eye className="h-4.25 w-4.25" strokeWidth={1.8} />
                  )}
                </button>
              </div>
              {errors.confirmPassword?.message && (
                <FieldError>{errors.confirmPassword.message}</FieldError>
              )}
            </Field>

            <FieldGroup>
              <Field>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
                </Button>
                <FieldDescription className="px-6 text-center">
                  Đã có tài khoản?{' '}
                  <Link
                    to="/login"
                    className="text-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Đăng nhập
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
