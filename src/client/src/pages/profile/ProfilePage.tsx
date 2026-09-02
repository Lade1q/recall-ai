import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Heading } from '@/components/ui/heading';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PersonalInfoTab } from '@/features/profile/components/PersonalInfoTab';
import { PasswordTab } from '@/features/profile/components/PasswordTab';

export default function ProfilePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  return (
    <div className="max-w-[900px]">
      <Heading as="h1" size="page" className="mb-1.5">
        Hồ sơ
      </Heading>
      <p className="text-muted-foreground mb-7 text-[13.5px]">
        Cập nhật thông tin cá nhân và bảo mật tài khoản.
      </p>

      <Tabs defaultValue="info">
        <TabsList variant="line" className="border-border mb-7 w-full gap-0 border-b">
          <TabsTrigger
            value="info"
            className="gap-1.75 text-muted-foreground after:bg-primary hover:text-foreground data-active:font-semibold data-active:text-primary-text px-5 py-2.5 text-[14px]"
          >
            <User size={16} />
            Thông tin cá nhân
          </TabsTrigger>
          <TabsTrigger
            value="password"
            className="gap-1.75 text-muted-foreground after:bg-primary hover:text-foreground data-active:font-semibold data-active:text-primary-text px-5 py-2.5 text-[14px]"
          >
            <Lock size={16} />
            Đổi mật khẩu
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <PersonalInfoTab />
        </TabsContent>
        <TabsContent value="password">
          <PasswordTab />
        </TabsContent>
      </Tabs>

      <div className="mt-3 flex justify-end pt-8">
        <Button variant="destructive" onClick={handleLogout}>
          <LogOut size={15} />
          Đăng xuất
        </Button>
      </div>
    </div>
  );
}
