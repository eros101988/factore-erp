import { logoutAction } from '@/app/actions/auth';

export async function POST() {
  await logoutAction();
  return new Response(null, { status: 302, headers: { Location: '/login' } });
}
