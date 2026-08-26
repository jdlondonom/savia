import { PlatformDashboard } from '@/app/platform/platform-dashboard';
import { getPlatformData } from '@/lib/platform';

export const dynamic = 'force-dynamic';

export default async function PlatformPage() {
  const data = await getPlatformData();
  return <PlatformDashboard initialData={data} />;
}
