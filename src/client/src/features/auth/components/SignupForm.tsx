import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/context/AuthContext';
import { getAuthErrorMessage } from '@/features/auth/api/auth.api';
import { registerSchema, type RegisterFormData } from '@/features/auth/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldRequirement,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function SignupForm({ className, ...props }: React.ComponentProps<typeof Card>) {
  const navigate = useNavigate();
  const { register: registerAuth } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });

  const passwordValue = useWatch({ control, name: 'password' });
  const passwordLength = passwordValue?.length ?? 0;
  const isPasswordValid = passwordLength >= 8;
  const missingPasswordChars = 8 - passwordLength;

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
    <Card className={cn('[--card-spacing:--spacing(7)]', className)} {...props}>
      <CardHeader className="gap-1.5">
        <div className="font-heading mb-[26px] text-base tracking-tight">Recall AI</div>
        <CardTitle className="font-heading text-[23px] font-bold leading-[1.2] tracking-tight">
          Tạo tài khoản
        </CardTitle>
        <CardDescription className="text-[13px] leading-[1.6]">
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
              <FieldRequirement satisfied={isPasswordValid} className="mt-1">
                {isPasswordValid ? 'Đủ 8 ký tự.' : `Còn thiếu ${missingPasswordChars} ký tự`}
              </FieldRequirement>
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
                <Button type="submit" loading={isSubmitting} className="w-full">
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
