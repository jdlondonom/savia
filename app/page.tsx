import { Dashboard } from '@/app/dashboard';
import { getAppContext } from '@/lib/context';
import { getDashboardData } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const context = await getAppContext();
  const data = await getDashboardData(context);
  return <Dashboard initialData={data} />;
}
