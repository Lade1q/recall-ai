import { useState, useCallback } from 'react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { profileApi } from '../api/profile.api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LockedValue } from '@/components/ui/locked-value';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

function formatJoinDate(isoDate: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(isoDate));
}

/**
 * Tab "Thông tin cá nhân" — SPEC #166.
 *
 * Chỉ có **một** ô sửa được: "Tên hiển thị", map thẳng vào cột `name` của `model User`. Bản đầu
 * còn hai ô nữa, cả hai đã bỏ khi review #360:
 *
 * - **"Số điện thoại"** không có nơi chứa — `model User` không có cột nào cho nó, không gửi lên,
 *   không đọc về. Một ô nhập gõ được rồi mất trắng sau khi tải lại.
 * - **"Họ và tên"** trùng vai với "Tên hiển thị" và `onChange` của nó gọi `setNameInput(value)`,
 *   tức gõ vào ô này **ghi đè im lặng** ô kia. Giữ "Tên hiển thị" vì đó đúng là nhãn người dùng
 *   đã thấy lúc tự gõ giá trị vào (`SignupForm.tsx`), nên nó là chữ họ nhận ra.
 */
export function PersonalInfoTab() {
  const { user, updateUser } = useAuth();
  const [nameInput, setNameInput] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNameInput(e.target.value);
    // Câu "Đã lưu thay đổi." nói về giá trị vừa gửi đi; user gõ tiếp là nó hết đúng.
    setSuccess(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const trimmed = nameInput.trim();
      // `null` chứ không phải `''`: `User.name` là `String?`, và `null` là cách nói *xoá tên*.
      // `updateProfileSchema` nhận `null` từ PR này (trước đó khai `z.string()` trần nên xoá tên
      // trả 400).
      //
      // ⚠️ Còn hở: tên **một ký tự** vẫn bị `min(2)` phía server từ chối → 400 → câu chung chung
      // "Không thể lưu.". Đang theo dõi ở #370; đừng vá riêng ở client kẻo hai tầng lệch luật.
      const result = await profileApi.updateName({ name: trimmed || null });
      updateUser({ name: result.name });
      setSuccess(true);
    } catch {
      setError('Không thể lưu. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }, [nameInput, user, updateUser]);

  if (!user) return null;

  return (
    <Card>
      <CardContent className="space-y-5 pt-2">
        <div className="max-w-[440px]">
          <Label htmlFor="profile-name" className="mb-2 text-[13px] font-semibold">
            Tên hiển thị <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="profile-name"
            type="text"
            value={nameInput}
            onChange={handleNameChange}
            placeholder="Chưa đặt"
            maxLength={100}
          />
          {/*
            Câu cũ — "Bỏ trống thì hệ thống dùng phần đầu của email." — mô tả một hành vi **không
            còn tồn tại**. Nó có thật, nhưng chỉ trong `IdentitySection` (`email.split('@')[0]`),
            một trong ba component không ai render, đã xoá cùng PR này. Bề mặt duy nhất hiển thị
            tên là `DashboardHeader`, và nó **cố ý bỏ hẳn tên** khi `null`:
            `{greeting}{name ? \`, ${name}\` : ''}`. Câu dưới đây nói đúng điều đó.
          */}
          <p className="text-muted-foreground mt-1.5 text-[12px] leading-[1.6]">
            Bỏ trống cũng được — lời chào ở Dashboard sẽ không kèm tên.
          </p>
        </div>

        <div className="max-w-[440px]">
          <span className="mb-2 block text-[13px] font-semibold">Email</span>
          <LockedValue>{user.email}</LockedValue>
        </div>

        <div className="max-w-[440px]">
          <span className="mb-2 block text-[13px] font-semibold">Tham gia</span>
          <span className="text-muted-foreground font-mono text-[13px]">
            {user.createdAt ? formatJoinDate(user.createdAt) : '—'}
          </span>
        </div>
      </CardContent>

      <CardFooter className="justify-end gap-3.5">
        {success && <p className="text-mastery-strong text-[12px]">Đã lưu thay đổi.</p>}
        {error && <p className="text-destructive text-[12px]">{error}</p>}
        <Button onClick={handleSave} loading={saving}>
          Lưu thay đổi
        </Button>
      </CardFooter>
    </Card>
  );
}
