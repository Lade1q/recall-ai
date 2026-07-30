import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/context/AuthContext';
import { getAuthErrorMessage } from '@/features/auth/api/auth.api';
import { loginSchema, type LoginFormData } from '@/features/auth/schemas/auth.schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    resetField,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.email, data.password);
      toast.success('Đăng nhập thành công!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(getAuthErrorMessage(error).message);
      // Giữ email đã nhập, chỉ xoá mật khẩu và đưa con trỏ về đó — thứ duy nhất
      // cần gõ lại.
      resetField('password');
      setFocus('password');
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <div className="font-heading mb-6 text-base tracking-tight">Recall AI</div>
          <CardTitle className="text-[23px]">Đăng nhập</CardTitle>
          <CardDescription className="text-[13px]">
            Dùng email và mật khẩu bạn đã đăng ký.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
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
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
                  <a
                    href="#am-05"
                    className="text-muted-foreground hover:text-foreground ml-auto inline-block text-xs underline-offset-4 hover:underline"
                  >
                    Quên mật khẩu?
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
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
                {errors.password?.message && <FieldError>{errors.password.message}</FieldError>}
              </Field>

              <Field>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </Button>
                <FieldDescription className="text-center">
                  Chưa có tài khoản?{' '}
                  <Link
                    to="/register"
                    className="text-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Đăng ký
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
