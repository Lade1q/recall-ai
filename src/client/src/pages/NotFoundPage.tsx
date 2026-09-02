import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Heading as="h1" size="display">
        404
      </Heading>
      <p className="text-muted-foreground">Trang không tồn tại.</p>
      <Button asChild>
        <Link to="/dashboard">Về Dashboard</Link>
      </Button>
    </div>
  );
}
